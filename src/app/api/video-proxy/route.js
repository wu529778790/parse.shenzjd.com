/**
 * 通用视频代理：解决第三方视频 CDN（小红书 xhscdn 等）的 Referer 防盗链。
 * 这些 CDN 在 https 来源页面上直链加载/新窗口打开会 403，导致无法播放和下载。
 *
 * 用法：GET /api/video-proxy?url=<encodeURIComponent(原视频 URL)>
 *
 * - 小红书 xhscdn 视频 CDN：fetch 时带 Referer: https://www.xiaohongshu.com/
 * - 其他视频源：直接 fetch（不强制 Referer，避免误伤）
 * - 支持 Range 请求（浏览器播放/拖动进度条必须），透传 206 Partial Content
 * - 流式转发，不整段缓存到内存，避免大视频占用内存
 * - 透传 Content-Type / Content-Length / Accept-Ranges
 * - 超时策略：首字节 30s 快速失败；传输中不设总时长上限（大视频弱网可能传很久），
 *   仅在持续 30s 无新数据时判定上游挂起并中止；客户端断开时同步中止上游
 * - 目标地址加固：拒绝内网/环回/链路本地等私有地址（本路由无登录态，否则等同公开 SSRF）
 */
export const runtime = "nodejs";

import { isBlockedIP, getClientIP, logger } from "@/lib/api-utils";
import { fixDouyinFtyp } from "@/lib/douyin-extract";
import { isBilibiliVideoUrl } from "@/lib/bilibili-cdn";
import { biliStreamFetch } from "@/lib/bilibili-fetch";
import { isUnsafeTarget } from "@/lib/ssrf-guard";

function isXhsHost(hostname) {
  return hostname === "xhscdn.com" || hostname.endsWith(".xhscdn.com");
}

// 微博视频 CDN（f.video.weibocdn.com 等）：Referer 防盗链。
// 2026-11-17 本地实测：裸 UA GET 403（与线上 11 次播放 403 吻合），带微博域
// Referer 200；HEAD 则一律 403（verifyUrl 的 HEAD 探测走 uncertain 不阻断，
// 不会误判，无需改动）。
function isWeiboVideoHost(hostname) {
  return hostname === "weibocdn.com" || hostname.endsWith(".weibocdn.com");
}

// 抖音视频 CDN：会随机返回 ftyp box size 被混淆的 MP4（首字节 00→01），
// 导致播放器无法解析。需在代理中检测并修复该混淆（见 fixDouyinFtyp）。
// aweme.snssdk.com：抖音老版直链域名（/aweme/v1/play/?video_id=...，会 302 到
// 真实 CDN）。2026-09-23 线上 4 次 fetch failed 都是它，此前既不在修复名单里
// （混淆头不会被修），日志里也只有 "fetch failed" 看不出真因（见下方 e.cause）。
function isDouyinVideoHost(hostname) {
  return (
    hostname === "365yg.com" ||
    hostname.endsWith(".365yg.com") ||
    hostname === "douyinvod.com" ||
    hostname.endsWith(".douyinvod.com") ||
    hostname === "douyinstatic.com" ||
    hostname.endsWith(".douyinstatic.com") ||
    hostname === "snssdk.com" ||
    hostname.endsWith(".snssdk.com")
  );
}

/**
 * 把 undici fetch 的错误摊开成可诊断的一行：
 * undici 统一抛 `TypeError: fetch failed`，真正的 ECONNRESET / ETIMEDOUT /
 * ENOTFOUND 藏在 error.cause 里。不打印 cause 就只能看到"fetch failed"，
 * 线上无法判断是上游抽风、DNS 坏还是出口不通。
 */
function describeFetchError(error) {
  const cause = error?.cause;
  const causeMsg =
    cause && (cause.message || cause.code)
      ? `${cause.code ? `${cause.code}:` : ""}${cause.message || ""}`
      : "";
  return causeMsg ? `${error.message} (${causeMsg})` : String(error?.message);
}

/* ---------------- 目标地址加固（防 SSRF） ----------------
 * 守卫实现已抽到 src/lib/ssrf-guard.js（2026-11-27 与 image 代理共用）：
 * 本路由没有任何登录态，只校了协议就等于开放了一个服务器侧代理，任何人都能借它
 * 访问 169.254.169.254 云元数据、127.0.0.1 上的管理端口、10.x/172.16-31.x/192.168.x
 * 内网服务，而且响应体会被原样回吐。
 */
export async function GET(request) {
  // IP 黑名单：视频代理返回二进制流，无法套用解析接口的 JSON 蜜罐，
  // 此处对黑名单 IP 保持 403（视频代理只是前端加载资源的通道，不承载解析宣传）。
  const clientIP = getClientIP(request);
  if (isBlockedIP(clientIP)) {
    logger.warn(`黑名单 IP 被拦截(video-proxy): ip=${clientIP}`);
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const encoded = searchParams.get("url");
  if (!encoded) return new Response("Missing url", { status: 400 });

  let target;
  try {
    target = new URL(decodeURIComponent(encoded));
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol)) {
    return new Response("Only http(s) allowed", { status: 400 });
  }
  // 只允许代理公网地址，避免被当作内网探测/元数据读取的跳板
  if (await isUnsafeTarget(target.hostname, "video-proxy")) {
    logger.warn(
      `video-proxy 拒绝内网/非法目标: host=${target.hostname} ip=${clientIP}`
    );
    return new Response("Forbidden target", { status: 403 });
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
  };
  // 小红书视频 CDN 防盗链：必须 Referer: xiaohongshu.com，否则 403
  if (isXhsHost(target.hostname)) {
    headers.Referer = "https://www.xiaohongshu.com/";
  }
  // B站视频 CDN：带 bilibili Referer（防盗链口径与官方播放器一致）
  if (isBilibiliVideoUrl(target.href)) {
    headers.Referer = "https://www.bilibili.com/";
  }
  // 微博视频 CDN：带 weibo.com Referer，缺头 403（2026-11-15 线上 11 次播放失败）
  if (isWeiboVideoHost(target.hostname)) {
    headers.Referer = "https://weibo.com/";
  }

  // 透传客户端的 Range 头（浏览器播放/拖动进度条必需）
  const range = request.headers.get("range");
  if (range) {
    headers.Range = range;
  }

  const FIRST_BYTE_TIMEOUT_MS = 30000;
  const FIRST_BYTE_TIMEOUT = new Error("first-byte timeout");

  // upstreamController 改为可重新赋值：重试时整组替换。
  // 每次 fetch 前 arm 一个新的首字节超时定时器到当前 controller。
  let upstreamController = new AbortController();
  let timer = null;

  // 客户端断开（关页面 / 播放器换 Range 重新请求）时中止上游，避免后台白拉流量。
  // abort 原因必须是 AbortError 命名的错误：流式传输中断开时，该原因会沿
  // bodyGuard 流冒泡成 pipeTo 的失败，而 Next 的 pipeToNodeResponse 只对
  // AbortError 静默返回（server/pipe-readable.js 的 isAbortError），
  // 普通 Error 会被包装成「failed to pipe response」连 cause 全栈打进日志——
  // 播放器 seek/关页面的高频断流曾以此刷屏（2026-11 日志：5 天 80 次）。
  request.signal.addEventListener(
    "abort",
    () => upstreamController.abort(new DOMException("client aborted", "AbortError")),
    { once: true }
  );

  /**
   * 起一个首字节超时：到点 abort 当前 upstreamController。
   * 不能用 AbortSignal.timeout() 一刀切——它会连同 body 流一起掐断，
   * 大视频传输超过 30s 就会在中途断流（failed to pipe response / TimeoutError）。
   */
  const armFirstByteTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => upstreamController.abort(FIRST_BYTE_TIMEOUT),
      FIRST_BYTE_TIMEOUT_MS
    );
  };
  armFirstByteTimer();

  /**
   * 偶发重试：抖音/小红书 CDN 经常在并发拉流时主动 cancel/重置连接，
   * fetch 抛 ECONNRESET / fetch failed。对客户端尚未断开的情况做指数退避重试，
   * 把"上游临时抽风"消化掉，避免用户看到 502。
   * - 客户端断开 / 首字节超时：不重试
   * - 每次重试都重建 AbortController（旧的已 aborted 无法复用）
   * - 退避：500ms → 1500ms
   */
  const MAX_RETRIES = 2;
  // B站直链（playurlv3，oi 绑定签发方 IP）走专属路径：直连一次即回退中继，
  // 不做直连重试——失败原因是「出口不对」（403）或「节点不可达」（mcdn 边缘
  // 节点海外连不通 ETIMEDOUT），换重试不换出口没有意义
  const isBili = isBilibiliVideoUrl(target.href);
  let upstream;
  let lastErr;
  let directTimedOut = false;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 非首次重试前等待（指数退避）
    if (attempt > 0) {
      if (request.signal.aborted) break;
      if (isBili) break; // B站不重试直连，直接落到底部的中继回退
      const backoffMs = 500 * Math.pow(3, attempt - 1); // 500, 1500
      logger.warn(
        `video-proxy 重试第 ${attempt} 次: host=${target.hostname} backoff=${backoffMs}ms err=${describeFetchError(lastErr)}`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
      if (request.signal.aborted) break;
      // 重建 controller（旧 controller 已 aborted，无法复用）
      upstreamController = new AbortController();
      armFirstByteTimer();
    }
    try {
      upstream = await fetch(target.href, {
        headers,
        signal: upstreamController.signal,
      });
      break; // 成功拿到响应头，跳出重试循环
    } catch (e) {
      lastErr = e;
      clearTimeout(timer);
      // 客户端中断：谁都不救了
      if (request.signal.aborted) {
        logger.warn(`video-proxy 客户端中断: host=${target.hostname}`);
        return new Response("Client aborted", { status: 499 });
      }
      // 首字节超时（上游完全没响应头）
      if (upstreamController.signal.reason === FIRST_BYTE_TIMEOUT) {
        logger.warn(`video-proxy 上游首字节超时: host=${target.hostname}`);
        if (!isBili) {
          return new Response("Upstream timeout", { status: 504 });
        }
        directTimedOut = true;
        break; // B站落中继回退
      }
      // 其他错误（fetch failed / ECONNRESET 等）：非 B站继续重试；
      // B站直连失败一次即退出，落中继回退
      if (attempt === MAX_RETRIES && !isBili) {
        // 必须打印 cause（ECONNRESET / ETIMEDOUT / ENOTFOUND 等），
        // 否则线上只能看到统一的 "fetch failed"，无从判断是哪一层坏了
        const detail = describeFetchError(e);
        logger.error(
          `video-proxy upstream fetch failed (重试 ${MAX_RETRIES} 次后放弃): host=${target.hostname} ${detail}`
        );
        return new Response(`Upstream fetch failed: ${detail}`, {
          status: 502,
        });
      }
      if (isBili) break;
    }
  }
  // 响应头已到，首字节超时完成使命，传输阶段改用空闲超时
  clearTimeout(timer);

  // B站 playurlv3 直链把签发方 IP（oi）绑进签名校验，取流 IP 必须等于签发方。
  // playurl 由本机直连签发时直连即可取流；链接若经中继签发（番剧地区限制等
  // 场景回退中继），本机直连会 403（bilivideo 正式节点）或 ETIMEDOUT（mcdn
  // 边缘节点海外连不通）——任何直连失败都回退中继流式取流（与签发同出口）。
  // 中继不可流式（SCF/未配置）或回退仍失败（链接过期）时，落到底部的 502。
  if (
    isBili &&
    (!upstream || !upstream.ok) &&
    !request.signal.aborted
  ) {
    upstream?.body?.cancel?.().catch?.(() => {});
    try {
      const viaRelay = await biliStreamFetch(target.href, {
        headers,
        signal: upstreamController.signal,
      });
      if (viaRelay) {
        logger.log(
          `video-proxy B站直链直连失败(${upstream ? `HTTP ${upstream.status}` : describeFetchError(lastErr)})，回退中继流式: host=${target.hostname}`
        );
        upstream = viaRelay;
      }
    } catch (e) {
      logger.warn(
        `video-proxy B站中继流式回退失败: host=${target.hostname} err=${e.message}`
      );
    }
  }

  // upstream 仍为空 = 直连失败且没有可用的中继回退（或客户端已断开）
  if (!upstream) {
    if (request.signal.aborted) {
      return new Response("Client aborted", { status: 499 });
    }
    if (directTimedOut) {
      return new Response("Upstream timeout", { status: 504 });
    }
    const detail = describeFetchError(lastErr);
    logger.error(
      `video-proxy upstream fetch failed: host=${target.hostname} ${detail}`
    );
    return new Response(`Upstream fetch failed: ${detail}`, {
      status: 502,
    });
  }

  // 重定向后复查目标：undici 默认跟随跳转，跳转目标不经入口校验，
  // 用响应上的最终 URL 再兜一道（请求已发出，此处只能阻断回吐数据）。
  if (upstream.url) {
    let finalHost = "";
    try {
      finalHost = new URL(upstream.url).hostname;
    } catch {
      finalHost = "";
    }
    if (finalHost && finalHost !== target.hostname) {
      if (await isUnsafeTarget(finalHost, "video-proxy")) {
        upstream.body?.cancel().catch(() => {});
        logger.warn(
          `video-proxy 拒绝重定向到内网目标: from=${target.hostname} to=${finalHost}`
        );
        return new Response("Forbidden target", { status: 403 });
      }
    }
  }

  if (!upstream.ok) {
    logger.warn(`video-proxy upstream error: ${upstream.status} url=${target.hostname}`);
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
    });
  }

  // 空闲超时：传输中只要数据还在流动就放行，持续 30s 无新数据才中止
  const armIdleTimer = () => {
    timer = setTimeout(
      () => upstreamController.abort(new Error("upstream idle timeout")),
      FIRST_BYTE_TIMEOUT_MS
    );
  };
  armIdleTimer();
  // 抖音视频 CDN 需修复 ftyp 头混淆（仅第一个 chunk 可能含文件头）
  const isDouyin = isDouyinVideoHost(target.hostname);
  let firstChunk = true;
  const bodyGuard = new TransformStream({
    transform(chunk, controller) {
      clearTimeout(timer);
      armIdleTimer();
      if (isDouyin && firstChunk) {
        firstChunk = false;
        controller.enqueue(fixDouyinFtyp(chunk));
      } else {
        controller.enqueue(chunk);
      }
    },
    flush() {
      clearTimeout(timer);
    },
  });

  const contentType =
    upstream.headers.get("content-type") || "video/mp4";
  const contentLength = upstream.headers.get("content-length");
  const acceptRanges = upstream.headers.get("accept-ranges");

  // 206 分片响应不能进共享缓存：本路由没有 Vary: Range，缓存会把某个 bytes=0-1023
  // 的分片当成完整资源回给下一个播放器。所以分片走 private，只有完整 200 才 public。
  const responseHeaders = {
    "Content-Type": contentType,
    "Cache-Control":
      upstream.status === 206
        ? "private, max-age=3600"
        : "public, max-age=3600",
    "Accept-Ranges": acceptRanges || "bytes",
  };
  if (contentLength) {
    responseHeaders["Content-Length"] = contentLength;
  }
  // 透传 206 的 Content-Range（Range 请求时上游会返回）
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) {
    responseHeaders["Content-Range"] = contentRange;
  }

  if (!upstream.body) {
    logger.warn(`video-proxy upstream 无响应体: ${upstream.status} host=${target.hostname}`);
    return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body.pipeThrough(bodyGuard), {
    status: upstream.status,
    headers: responseHeaders,
  });
}