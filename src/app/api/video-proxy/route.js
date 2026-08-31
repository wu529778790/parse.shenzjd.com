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
 */
export const runtime = "nodejs";

import { isBlockedIP, getClientIP, logger } from "@/lib/api-utils";
import { fixDouyinFtyp } from "@/lib/douyin-extract";

function isXhsHost(hostname) {
  return hostname === "xhscdn.com" || hostname.endsWith(".xhscdn.com");
}

// 抖音视频 CDN：会随机返回 ftyp box size 被混淆的 MP4（首字节 00→01），
// 导致播放器无法解析。需在代理中检测并修复该混淆（见 fixDouyinFtyp）。
function isDouyinVideoHost(hostname) {
  return (
    hostname === "365yg.com" ||
    hostname.endsWith(".365yg.com") ||
    hostname === "douyinvod.com" ||
    hostname.endsWith(".douyinvod.com") ||
    hostname === "douyinstatic.com" ||
    hostname.endsWith(".douyinstatic.com")
  );
}

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

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
  };
  // 小红书视频 CDN 防盗链：必须 Referer: xiaohongshu.com，否则 403
  if (isXhsHost(target.hostname)) {
    headers.Referer = "https://www.xiaohongshu.com/";
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

  // 客户端断开（关页面 / 播放器换 Range 重新请求）时中止上游，避免后台白拉流量
  request.signal.addEventListener(
    "abort",
    () => upstreamController.abort(new Error("client aborted")),
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
  let upstream;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 非首次重试前等待（指数退避）
    if (attempt > 0) {
      if (request.signal.aborted) break;
      const backoffMs = 500 * Math.pow(3, attempt - 1); // 500, 1500
      logger.warn(
        `video-proxy 重试第 ${attempt} 次: host=${target.hostname} backoff=${backoffMs}ms err=${lastErr?.message}`
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
      // 首字节超时 / 客户端中断：不重试，直接返回
      if (upstreamController.signal.reason === FIRST_BYTE_TIMEOUT) {
        logger.warn(`video-proxy 上游首字节超时: host=${target.hostname}`);
        return new Response("Upstream timeout", { status: 504 });
      }
      if (request.signal.aborted) {
        logger.warn(`video-proxy 客户端中断: host=${target.hostname}`);
        return new Response("Client aborted", { status: 499 });
      }
      // 其他错误（fetch failed / ECONNRESET 等）：继续重试循环
      if (attempt === MAX_RETRIES) {
        logger.error(
          `video-proxy upstream fetch failed (重试 ${MAX_RETRIES} 次后放弃): ${e.message}`
        );
        return new Response(`Upstream fetch failed: ${e.message}`, {
          status: 502,
        });
      }
    }
  }
  // 响应头已到，首字节超时完成使命，传输阶段改用空闲超时
  clearTimeout(timer);
  if (!upstream.ok && upstream.status !== 206) {
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

  const responseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600",
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

  return new Response(upstream.body.pipeThrough(bodyGuard), {
    status: upstream.status,
    headers: responseHeaders,
  });
}