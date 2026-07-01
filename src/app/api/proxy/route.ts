export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { logger, rateLimit, getClientIP, getCorsHeaders } from "@/lib/api-utils";
import { verifyBasicAuth, unauthorizedResponse } from "@/lib/auth";

const UPSTREAM_TIMEOUT_MS = Number(
  process.env.PROXY_UPSTREAM_TIMEOUT_MS || 30000
);

function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ code: 429, msg: "请求过于频繁，请稍后再试" }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || "") as Record<
    string,
    string
  >;
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Range",
    },
  });
}

function proxyErrorResponse(
  message: string,
  status = 502,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.message.includes("timed out") ||
      (error as NodeJS.ErrnoException).code === "ETIMEDOUT")
  );
}

function wrapUpstreamBody(
  body: ReadableStream<Uint8Array> | null
): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  const reader = body.getReader();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (!closed) {
            closed = true;
            controller.close();
          }
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        if (!closed) {
          closed = true;
          logger.warn("Upstream proxy stream terminated early:", error);
          controller.close();
        }
      }
    },
    async cancel(reason) {
      closed = true;
      try {
        await reader.cancel(reason);
      } catch {
        // Ignore cancellation races from the upstream body.
      }
    },
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getBilibiliProxyUserAgent(): string {
  return process.env.BILIBILI_USER_AGENT || DEFAULT_UA;
}

function getBilibiliProxyCookie(): string {
  return process.env.BILIBILI_COOKIE || "";
}

function isBilibiliHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower.includes("bilibili") ||
    lower.includes("hdslb") ||
    lower.includes("bilivideo") ||
    lower.includes("akamaized") ||
    lower.includes("akamaihd") ||
    lower.includes("bvcvod")
  );
}

// SSRF防护：检查是否为内网地址（与 api-utils.js 中 sanitizeUrl 逻辑对齐）
function isPrivateHostname(hostname: string): boolean {
  // new URL() 对 IPv6 保留方括号，统一去掉
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  const blockedExact = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "0:0:0:0:0:0:0:1",
    "0:0:0:0:0:0:0:0",
  ];
  if (blockedExact.includes(lower)) return true;

  const blockedPrefixes = [
    "10.",
    "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.",
    "172.24.", "172.25.", "172.26.", "172.27.",
    "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
    "169.254.",
  ];

  // IPv4-mapped IPv6 私有地址（URL标准化后的 hex 格式）
  const blockedIPv4MappedPrefixes = [
    "::ffff:7f00:",
    "::ffff:a:",
    "::ffff:ac10:",
    "::ffff:c0a8:",
    "::ffff:a9fe:",
  ];

  // IPv6 私有地址段
  const blockedIPv6Prefixes = [
    "fc00:", "fd00:",
    "fe80:",
  ];

  if (blockedPrefixes.some((p) => lower.startsWith(p))) return true;
  if (blockedIPv4MappedPrefixes.some((p) => lower.startsWith(p))) return true;
  if (blockedIPv6Prefixes.some((p) => lower.startsWith(p))) return true;

  return false;
}

// 允许的域名白名单 — 使用后缀匹配
const ALLOWED_DOMAINS = [
  "douyinpic.com",
  "snssdk.com",
  "douyinvod.com",
  "zjcdn.com",
  "aweme.com",
  "iesdouyin.com",
  "hdslb.com",
  "bilibili.com",
  "bilivideo.com",
  "akamaized.net",
  "akamaihd.net",
  "bvcvod.com",
  "kwaicdn.com",
  "kwimgs.com",
  "kuaishou.com",
  "kscdns.com",
  "ksyungslb.com",
  "gifshow.com",
  "xiaohongshu.com",
  "xhslink.com",
  "xhscdn.com",
  "xhsimgs.com",
  "redbook.today",
  "pipigx.com",
  "pipix.com",
  "ippzone.com",
  "weibo.com",
  "sinaimg.cn",
  "sina.com.cn",
  "douyin.com",
];

function isAllowedDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some(
    (domain) => lower === domain || lower.endsWith("." + domain)
  );
}

export async function GET(req: NextRequest) {
  // 统一计算 CORS 头：仅允许 *.shenzjd.com（与解析接口策略一致）
  // proxy 响应会喂给前端 <video crossOrigin="anonymous">，必须回显正确 Origin，否则浏览器拒绝加载
  const corsHeaders = getCorsHeaders(
    req.headers.get("origin") || ""
  ) as Record<string, string>;

  // Basic Auth 验证
  if (!verifyBasicAuth(req)) {
    return unauthorizedResponse();
  }

  // 速率限制
  const clientIP = getClientIP(req);
  if (!rateLimit(clientIP)) {
    return rateLimitResponse();
  }

  const search = req.nextUrl.searchParams;
  const targetUrl = search.get("url");
  const customFilename = search.get("filename") || undefined;
  const customReferer = search.get("referer") || undefined;
  const customUA = search.get("ua") || undefined;
  const disposition = (search.get("disposition") || "attachment").toLowerCase();
  const overrideContentType = search.get("contentType") || undefined;

  if (!targetUrl) {
    return new Response("Missing url", {
      status: 400,
      headers: { ...corsHeaders },
    });
  }

  // 仅允许 http/https
  if (!/^https?:\/\//i.test(targetUrl)) {
    return new Response("Invalid url scheme", {
      status: 400,
      headers: { ...corsHeaders },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response("Invalid url", {
      status: 400,
      headers: { ...corsHeaders },
    });
  }

  // SSRF防护：阻止访问内网地址
  if (isPrivateHostname(parsed.hostname)) {
    logger.warn(`SSRF blocked: ${parsed.hostname}`);
    return new Response("Access denied: private network", {
      status: 403,
      headers: { ...corsHeaders },
    });
  }

  // 域名白名单检查
  if (!isAllowedDomain(parsed.hostname)) {
    logger.warn(`Domain not allowed: ${parsed.hostname}`);
    logger.warn(`Allowed domains: ${ALLOWED_DOMAINS.join(", ")}`);
    return new Response(`Domain not allowed: ${parsed.hostname}`, {
      status: 403,
      headers: { ...corsHeaders },
    });
  }

  console.log("[proxy] target:", targetUrl.substring(0, 120));
  console.log("[proxy] hostname:", parsed.hostname);

  function guessRefererByHost(hostname: string): string | undefined {
    const lower = hostname.toLowerCase();

    if (
      lower.includes("douyin") ||
      lower.includes("douyinpic") ||
      lower.includes("snssdk") ||
      lower.includes("douyinvod") ||
      lower.includes("zjcdn") ||
      lower.includes("aweme") ||
      lower.includes("iesdouyin")
    ) {
      return "https://www.douyin.com/";
    }

    if (isBilibiliHostname(lower)) {
      return "https://www.bilibili.com/";
    }

    if (
      lower.includes("kuaishou") ||
      lower.includes("kwaicdn") ||
      lower.includes("kwimgs") ||
      lower.includes("ksyungslb") ||
      lower.includes("gifshow") ||
      lower.includes("kscdns")
    ) {
      return "https://www.kuaishou.com/";
    }

    if (lower.includes("weibo") || lower.includes("sina")) {
      return "https://weibo.com/";
    }

    if (
      lower.includes("xiaohongshu") ||
      lower.includes("xhscdn") ||
      lower.includes("xhsimgs") ||
      lower.includes("redbook")
    ) {
      return "https://www.xiaohongshu.com/";
    }

    if (
      lower.includes("pipigx") ||
      lower.includes("pipix") ||
      lower.includes("ippzone")
    ) {
      return "https://h5.pipix.com/";
    }

    return `${parsed.protocol}//${parsed.host}/`;
  }

  function sanitizeFilename(name: string): string {
    const sanitized = name
      .replace(/[\\/:*?"<>|#]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return sanitized || "download";
  }

  function extFromMime(mime: string | null): string | undefined {
    if (!mime) return undefined;
    const type = mime.toLowerCase();
    if (type.includes("mp4")) return ".mp4";
    if (type.includes("webm")) return ".webm";
    if (type.includes("quicktime") || type.includes("mov")) return ".mov";
    if (type.includes("mpeg")) return ".mpg";
    if (type.includes("x-m4a") || type.includes("aac")) return ".m4a";
    if (type.includes("mp3")) return ".mp3";
    if (type.includes("ogg")) return ".ogg";
    return undefined;
  }

  // 视频 CDN 特殊处理 — 手动跟踪重定向，强制 HTTPS
  // 抖音/小红书 CDN 返回的 http:// 链接可能触发浏览器 QUIC 协议错误，
  // 这里手动处理重定向并将目标 URL 升级为 HTTPS
  async function fetchVideoWithFollow(url: string, referer: string, isDouyin: boolean): Promise<Response> {
    const headers: Record<string, string> = {
      "User-Agent": DEFAULT_UA,
    };
    // 抖音 CDN 可能因 Referer 被拦截（直接访问无 Referer 反而正常），故跳过
    if (!isDouyin && referer) headers["Referer"] = referer;

    let currentUrl = url;
    for (let i = 0; i < 5; i++) {
      logger.log(`[proxy] fetchVideoWithFollow step ${i}: ${currentUrl.substring(0, 100)}`);
      const resp = await fetchWithTimeout(currentUrl, {
        headers,
        redirect: "manual",
      });
      logger.log(`[proxy] step ${i} response: HTTP ${resp.status}`);

      if (resp.status < 300 || resp.status >= 400) {
        return resp;
      }

      const location = resp.headers.get("location");
      if (!location) return resp;

      // 解析重定向目标并强制升级为 HTTPS（避免 QUIC 协议）
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        return resp;
      }

      // 强制升级为 HTTPS，避免 QUIC 协议错误
      if (redirectUrl.protocol === "http:") {
        redirectUrl.protocol = "https:";
      }

      // SSRF 防护：重定向目标也必须过内网检查与域名白名单
      // 与下方"其他资源"分支保持一致，避免抖音/小红书路径成为绕过入口
      if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
        logger.warn(`Video CDN redirect to non-http scheme blocked: ${redirectUrl.protocol}`);
        return new Response("Redirect to non-http scheme blocked", {
          status: 403,
          headers: { ...corsHeaders },
        });
      }
      if (isPrivateHostname(redirectUrl.hostname)) {
        logger.warn(`SSRF blocked (video CDN redirect): ${redirectUrl.hostname}`);
        return new Response("Access denied: redirect to private network", {
          status: 403,
          headers: { ...corsHeaders },
        });
      }
      if (!isAllowedDomain(redirectUrl.hostname)) {
        logger.warn(`Domain not allowed (video CDN redirect): ${redirectUrl.hostname} (allowed: ${ALLOWED_DOMAINS.join(", ")})`);
        return new Response("Domain not allowed", {
          status: 403,
          headers: { ...corsHeaders },
        });
      }

      currentUrl = redirectUrl.toString();
    }

    throw new Error("Too many redirects");
  }

  const isBilibiliTarget = isBilibiliHostname(parsed.hostname);
  const bilibiliCookie = getBilibiliProxyCookie();
  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      customUA ||
      (isBilibiliTarget
        ? getBilibiliProxyUserAgent()
        : req.headers.get("user-agent") || DEFAULT_UA),
  };
  const fwdRange = req.headers.get("range");
  if (fwdRange) upstreamHeaders["Range"] = fwdRange;
  const refererToUse = customReferer || guessRefererByHost(parsed.hostname);
  if (refererToUse) upstreamHeaders["Referer"] = refererToUse;
  if (isBilibiliTarget) {
    upstreamHeaders["Origin"] = "https://www.bilibili.com";
    upstreamHeaders["Accept"] = "*/*";
    upstreamHeaders["Accept-Language"] = "zh-CN,zh;q=0.9,en;q=0.8";
    if (bilibiliCookie) {
      upstreamHeaders["Cookie"] = bilibiliCookie;
    }
  }

  // 手动处理重定向，验证每次跳转目标
  let upstreamResp: Response | null = null;
  let currentUrl = targetUrl;
  const MAX_REDIRECTS = 5;

  try {
    const isDouyinTarget =
      parsed.hostname.includes("snssdk") ||
      parsed.hostname.includes("douyinvod") ||
      parsed.hostname.includes("zjcdn") ||
      parsed.hostname.includes("aweme");

    const isXhsTarget =
      parsed.hostname.includes("xhscdn") ||
      parsed.hostname.includes("xhsimgs");

    // 抖音/小红书视频 CDN：手动跟随重定向链
    if (isDouyinTarget || isXhsTarget) {
      const referer = isXhsTarget
        ? "https://www.xiaohongshu.com/"
        : "https://www.douyin.com/";
      logger.log(`[proxy] Douyin/XHS target detected, url: ${currentUrl.substring(0, 100)}`);
      upstreamResp = await fetchVideoWithFollow(currentUrl, referer, isDouyinTarget);
      if (upstreamResp && upstreamResp.status === 403) {
        logger.warn(`[proxy] Douyin CDN returned 403. Target: ${currentUrl.substring(0, 80)}`);
      }
    } else {
      // 其他资源：手动处理重定向，验证每次跳转目标
      for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount++) {
        const resp = await fetchWithTimeout(currentUrl, {
          headers: upstreamHeaders,
          redirect: "manual",
        });

        // 非重定向响应，直接返回
        if (resp.status < 300 || resp.status >= 400) {
          upstreamResp = resp;
          break;
        }

        // 处理 3xx 重定向 — 验证目标地址
        const location = resp.headers.get("location");
        if (!location) {
          upstreamResp = resp;
          break;
        }

        // 解析重定向目标
        let redirectUrl: URL;
        try {
          redirectUrl = new URL(location, currentUrl);
        } catch {
          upstreamResp = resp;
          break;
        }

        // 验证重定向目标的 scheme
        if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
          logger.warn(`Redirect to non-http scheme blocked: ${redirectUrl.protocol}`);
          return new Response("Redirect to non-http scheme blocked", {
            status: 403,
            headers: { ...corsHeaders },
          });
        }

        // 验证重定向目标不是内网地址
        if (isPrivateHostname(redirectUrl.hostname)) {
          logger.warn(`SSRF redirect blocked: ${redirectUrl.hostname}`);
          return new Response("Access denied: redirect to private network", {
            status: 403,
            headers: { ...corsHeaders },
          });
        }

        // 跟进重定向
        currentUrl = redirectUrl.toString();
      }
    }

    if (!upstreamResp) {
      return new Response("Too many redirects", {
        status: 502,
        headers: { ...corsHeaders },
      });
    }
  } catch (error) {
    logger.error("Proxy upstream fetch failed:", error);
    return proxyErrorResponse(
      isTimeoutError(error) ? "Upstream request timed out" : "Upstream fetch failed",
      isTimeoutError(error) ? 504 : 502,
      corsHeaders
    );
  }

  const contentType =
    overrideContentType ||
    upstreamResp.headers.get("content-type") ||
    "application/octet-stream";

  // 为抖音资源设置正确的Content-Type
  let finalContentType = contentType;
  if (
    parsed.hostname.includes("snssdk") ||
    parsed.hostname.includes("douyinvod") ||
    parsed.hostname.includes("zjcdn") ||
    parsed.hostname.includes("aweme") ||
    parsed.hostname.includes("xhscdn") ||
    parsed.hostname.includes("xhsimgs") ||
    parsed.hostname.includes("redbook")
  ) {
    const isImage = contentType.includes("image");
    if (
      !isImage &&
      (contentType === "application/octet-stream" ||
        !contentType.includes("video"))
    ) {
      finalContentType = "video/mp4";
    }
  }

  // 生成文件名
  const urlPathname = decodeURIComponent(parsed.pathname || "/");
  const lastSegment = urlPathname.split("/").filter(Boolean).pop() || "file";
  const baseCandidate = customFilename || lastSegment;
  const baseNameNoExt = baseCandidate.replace(/\.[a-z0-9]{1,6}$/i, "");
  const ext =
    extFromMime(contentType) ||
    (baseCandidate.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? "");
  const finalFilename = sanitizeFilename(baseNameNoExt) + (ext || "");

  const respHeaders: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": finalContentType,
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
  const contentLength = upstreamResp.headers.get("content-length");
  if (contentLength) respHeaders["Content-Length"] = contentLength;
  const acceptRanges = upstreamResp.headers.get("accept-ranges");
  if (acceptRanges) respHeaders["Accept-Ranges"] = acceptRanges;
  const contentRange = upstreamResp.headers.get("content-range");
  if (contentRange) respHeaders["Content-Range"] = contentRange;
  if (disposition === "attachment") {
    respHeaders[
      "Content-Disposition"
    ] = `attachment; filename*=UTF-8''${encodeURIComponent(finalFilename)}`;
  }

  return new Response(wrapUpstreamBody(upstreamResp.body), {
    status: upstreamResp.status,
    headers: respHeaders,
  });
}
