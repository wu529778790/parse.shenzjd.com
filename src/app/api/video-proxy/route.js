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
 */
export const runtime = "nodejs";

import { isBlockedIP, getClientIP, logger } from "@/lib/api-utils";

function isXhsHost(hostname) {
  return hostname === "xhscdn.com" || hostname.endsWith(".xhscdn.com");
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

  let upstream;
  try {
    upstream = await fetch(target.href, {
      headers,
      // 视频流式转发，不设超时上限（大视频下载可能较久）
      // 仅对首字节响应设置超时，避免上游挂起
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    logger.error(`video-proxy upstream fetch failed: ${e.message}`);
    return new Response(`Upstream fetch failed: ${e.message}`, {
      status: 502,
    });
  }
  if (!upstream.ok && upstream.status !== 206) {
    logger.warn(`video-proxy upstream error: ${upstream.status} url=${target.hostname}`);
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
    });
  }

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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}