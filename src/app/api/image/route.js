/**
 * 通用图片代理：解决第三方图床（小红书 sns-webpic、sns-avatar-qc 等）的
 * Referer 防盗链。这些 CDN 在 https 来源页面上直链加载会 403。
 *
 * 用法：GET /api/image?url=<encodeURIComponent(原图 URL)>
 *
 * - 小红书 xhscdn 图床：fetch 时带 Referer: https://www.xiaohongshu.com/
 * - 其他图床：直接 fetch（不强制 Referer，避免误伤）
 * - 内存 LRU 缓存 6 小时（图床 URL 不变，重复请求免重复 fetch）
 * - 10MB 上限保护
 * - 透传 Content-Type，加 Cache-Control: public, max-age=21600
 */
export const runtime = "nodejs";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;

function isXhsHost(hostname) {
  return hostname === "xhscdn.com" || hostname.endsWith(".xhscdn.com");
}

export async function GET(request) {
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

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
  };
  // 小红书图床防盗链：必须 Referer: xiaohongshu.com，否则 403
  if (isXhsHost(target.hostname)) {
    headers.Referer = "https://www.xiaohongshu.com/";
  }

  let upstream;
  try {
    upstream = await fetch(target.href, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return new Response(`Upstream fetch failed: ${e.message}`, {
      status: 502,
    });
  }
  if (!upstream.ok) {
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
    });
  }

  const arrayBuffer = await upstream.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_BYTES) {
    return new Response("Image too large", { status: 413 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
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