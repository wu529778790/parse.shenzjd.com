/**
 * 通用图片代理：解决第三方图床（小红书 sns-webpic、sns-avatar-qc 等）的
 * Referer 防盗链。这些 CDN 在 https 来源页面上直链加载会 403。
 *
 * 用法：GET /api/image?url=<encodeURIComponent(原图 URL)>
 *
 * - 目标地址加固（防 SSRF，2026-11-27）：共用 src/lib/ssrf-guard.js，内网/环回/
 *   链路本地目标一律 403；重定向改为手动逐跳复查（fetch 默认跟随跳转会绕过入口
 *   校验）。事故背景：本路由此前只校了协议，被当成跳板扫穿整台服务器的 docker
 *   内网（522 次探测、242 次 200，读到 panhub 搜索接口与各站点首页/JS）。
 * - 只回吐图片：上游必须是 image/* 或 application/octet-stream，HTML/JSON/文本
 *   一律 502 —— 否则这个无登录态代理就是一条任意内网文本的读取通道。
 * - 小红书 xhscdn 图床：fetch 时带 Referer: https://www.xiaohongshu.com/
 * - 其他图床：直接 fetch（不强制 Referer，避免误伤）
 * - 内存 LRU 缓存 6 小时（图床 URL 不变，重复请求免重复 fetch）
 * - 10MB 上限保护
 * - 透传 Content-Type，加 Cache-Control: public, max-age=21600
 */
export const runtime = "nodejs";

import { isBlockedIP, getClientIP, logger } from "@/lib/api-utils";
import { isUnsafeTarget } from "@/lib/ssrf-guard";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;
// 图床跳转通常 1~2 跳（短链/旧域名 → 签名 CDN），留 3 跳余量
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isXhsHost(hostname) {
  return hostname === "xhscdn.com" || hostname.endsWith(".xhscdn.com");
}

// B站图床（封面/头像）：对外站 Referer 返回 403，需带 bilibili 来源
function isBiliHost(hostname) {
  return (
    hostname === "hdslb.com" ||
    hostname.endsWith(".hdslb.com") ||
    hostname === "bilibili.com" ||
    hostname.endsWith(".bilibili.com")
  );
}

/** 按当前跳转位置构造请求头（跳转后按新主机重算，防盗链 Referer 才能跟到最终 CDN） */
function buildHeaders(target) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
  };
  // 小红书图床防盗链：必须 Referer: xiaohongshu.com，否则 403
  if (isXhsHost(target.hostname)) {
    headers.Referer = "https://www.xiaohongshu.com/";
  }
  // B站图床防盗链：必须 Referer: bilibili.com，否则 403
  if (isBiliHost(target.hostname)) {
    headers.Referer = "https://www.bilibili.com/";
  }
  return headers;
}

/** 只接受图片类响应；application/octet-stream 兼容个别 CDN 的通用二进制类型 */
function isAllowedImageType(contentType) {
  const type = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return type.startsWith("image/") || type === "application/octet-stream";
}

export async function GET(request) {
  // IP 黑名单：图片代理返回二进制图片，无法套用解析接口的 JSON 蜜罐，
  // 此处对黑名单 IP 保持 403（图片代理只是前端加载资源的通道，不承载解析宣传）。
  const clientIP = getClientIP(request);
  if (isBlockedIP(clientIP)) {
    logger.warn(`黑名单 IP 被拦截(image): ip=${clientIP}`);
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
  // B站图床 http 直链统一升级 https（与官方口径一致，少一跳 301）
  if (isBiliHost(target.hostname)) {
    target.protocol = "https:";
  }
  // 只允许代理公网地址，避免被当作内网探测/元数据读取的跳板
  if (await isUnsafeTarget(target.hostname, "image-proxy")) {
    logger.warn(
      `image-proxy 拒绝内网/非法目标: host=${target.hostname} ip=${clientIP}`
    );
    return new Response("Forbidden target", { status: 403 });
  }

  const cacheKey = target.href;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return new Response(cached.buffer, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=21600",
      },
    });
  }

  // 手动跟随跳转：每一跳都重跑一次网守。fetch 默认 redirect:"follow" 会在内部
  // 直接把请求打到跳转目标，入口那次校验根本看不到最终地址。
  let current = target;
  let upstream = null;
  for (let hop = 0; ; hop++) {
    let response;
    try {
      response = await fetch(current.href, {
        headers: buildHeaders(current),
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e.message}`, {
        status: 502,
      });
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel?.().catch?.(() => {});
      let next = null;
      try {
        next = location ? new URL(location, current) : null;
      } catch {
        next = null;
      }
      if (!next) {
        logger.warn(
          `image-proxy 跳转缺少有效地址: host=${current.hostname} status=${response.status}`
        );
        return new Response("Upstream redirect invalid", { status: 502 });
      }
      if (
        !/^https?:$/.test(next.protocol) ||
        (await isUnsafeTarget(next.hostname, "image-proxy"))
      ) {
        logger.warn(
          `image-proxy 拒绝跳转到内网/非法目标: from=${current.hostname} to=${next.hostname} ip=${clientIP}`
        );
        return new Response("Forbidden target", { status: 403 });
      }
      if (hop >= MAX_REDIRECTS) {
        logger.warn(
          `image-proxy 跳转次数超限: host=${target.hostname} last=${next.hostname}`
        );
        return new Response("Too many redirects", { status: 502 });
      }
      current = next;
      continue;
    }

    upstream = response;
    break;
  }

  if (!upstream.ok) {
    await upstream.body?.cancel?.().catch?.(() => {});
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!isAllowedImageType(contentType)) {
    await upstream.body?.cancel?.().catch?.(() => {});
    logger.warn(
      `image-proxy 拒绝非图片响应: host=${current.hostname} type=${
        contentType || "(none)"
      } ip=${clientIP} url=${current.href.slice(0, 120)}`
    );
    return new Response("Upstream content type not allowed", { status: 502 });
  }

  const arrayBuffer = await upstream.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_BYTES) {
    return new Response("Image too large", { status: 413 });
  }

  cache.set(cacheKey, {
    buffer,
    contentType,
    expires: Date.now() + CACHE_TTL_MS,
  });

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=21600",
    },
  });
}
