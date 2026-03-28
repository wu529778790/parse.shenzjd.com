export const runtime = "edge";

import { NextRequest } from "next/server";
import { logger } from "@/lib/api-utils";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

// SSRF防护：检查是否为内网地址
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  
  // 检查localhost
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "0.0.0.0" || lower === "::1") {
    return true;
  }
  
  // 检查私有IP段
  const privatePatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,  // 链路本地
    /^fc00:/,       // IPv6 私有
    /^fe80:/,       // IPv6 链路本地
  ];
  
  return privatePatterns.some(pattern => pattern.test(lower));
}

// 允许的域名白名单（可选，提高安全性）
const ALLOWED_DOMAINS = [
  "douyinpic.com",
  "snssdk.com",
  "douyinvod.com",
  "aweme.com",
  "hdslb.com",
  "bilibili.com",
  "kwaicdn.com",
  "kwimgs.com",
  "kuaishou.com",
  "xiaohongshu.com",
  "xhslink.com",
  "pipigx.com",
  "pipix.com",
  "weibo.com",
  "douyin.com",
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isAllowedDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some(domain => lower.endsWith(domain) || lower.includes(domain));
}

export async function GET(req: NextRequest) {
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
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // 仅允许 http/https
  if (!/^https?:\/\//i.test(targetUrl)) {
    return new Response("Invalid url scheme", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response("Invalid url", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // SSRF防护：阻止访问内网地址
  if (isPrivateHostname(parsed.hostname)) {
    logger.warn(`SSRF blocked: ${parsed.hostname}`);
    return new Response("Access denied: private network", {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // 域名白名单检查（可选启用）
  // if (!isAllowedDomain(parsed.hostname)) {
  //   logger.warn(`Domain not allowed: ${parsed.hostname}`);
  //   return new Response("Domain not allowed", {
  //     status: 403,
  //     headers: { "Access-Control-Allow-Origin": "*" },
  //   });
  // }

  const DEFAULT_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  function guessRefererByHost(hostname: string): string | undefined {
    const lower = hostname.toLowerCase();
    
    // 抖音相关域名
    if (lower.includes("douyin") || lower.includes("douyinpic") || 
        lower.includes("snssdk") || lower.includes("douyinvod") || 
        lower.includes("aweme") || lower.includes("iesdouyin")) {
      return "https://www.douyin.com/";
    }
    
    // 哔哩哔哩相关域名
    if (lower.includes("bilibili") || lower.includes("hdslb") || lower.includes("bilivideo")) {
      return "https://www.bilibili.com/";
    }
    
    // 快手相关域名
    if (lower.includes("kuaishou") || lower.includes("kwaicdn") || 
        lower.includes("kwimgs") || lower.includes("ksyungslb") ||
        lower.includes("gifshow") || lower.includes("kscdns")) {
      return "https://www.kuaishou.com/";
    }
    
    // 微博相关域名
    if (lower.includes("weibo") || lower.includes("sina")) {
      return "https://weibo.com/";
    }
    
    // 小红书相关域名
    if (lower.includes("xiaohongshu") || lower.includes("xhs") || lower.includes("xhscdn")) {
      return "https://www.xiaohongshu.com/";
    }
    
    // 皮皮虾相关域名
    if (lower.includes("pipigx") || lower.includes("pipix") || lower.includes("ippzone")) {
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

  // 抖音视频特殊处理函数
  async function fetchDouyinVideo(url: string) {
    const headers = {
      "User-Agent": MOBILE_UA,
      Referer: "https://www.douyin.com/",
    };

    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
      });

      if (response.status === 200 || response.status === 206) {
        return response;
      }

      // 如果是302重定向，跟踪重定向
      if (response.status === 302) {
        const location = response.headers.get("location");
        if (location) {
          return await fetch(location, {
            headers,
            redirect: "follow",
          });
        }
      }

      return response;
    } catch {
      // 出错时返回基本请求
      return await fetch(url, {
        headers,
        redirect: "follow",
      });
    }
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": customUA || req.headers.get("user-agent") || DEFAULT_UA,
  };
  const fwdRange = req.headers.get("range");
  if (fwdRange) upstreamHeaders["Range"] = fwdRange;
  const refererToUse = customReferer || guessRefererByHost(parsed.hostname);
  if (refererToUse) upstreamHeaders["Referer"] = refererToUse;

  let upstreamResp: Response;

  // 检查是否为抖音视频，使用专门的处理逻辑
  if (
    parsed.hostname.includes("snssdk") ||
    parsed.hostname.includes("douyinvod") ||
    parsed.hostname.includes("aweme")
  ) {
    upstreamResp = await fetchDouyinVideo(targetUrl);
  } else {
    upstreamResp = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });
  }

  const contentType =
    overrideContentType ||
    upstreamResp.headers.get("content-type") ||
    "application/octet-stream";

  // 为抖音视频强制设置正确的Content-Type
  let finalContentType = contentType;
  if (
    parsed.hostname.includes("snssdk") ||
    parsed.hostname.includes("douyinvod") ||
    parsed.hostname.includes("aweme")
  ) {
    if (
      contentType === "application/octet-stream" ||
      !contentType.includes("video")
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
    "Access-Control-Allow-Origin": "*",
    "Content-Type": finalContentType,
  };
  const contentLength = upstreamResp.headers.get("content-length");
  if (contentLength) respHeaders["Content-Length"] = contentLength;
  const acceptRanges = upstreamResp.headers.get("accept-ranges");
  if (acceptRanges) respHeaders["Accept-Ranges"] = acceptRanges;
  if (disposition === "attachment") {
    respHeaders[
      "Content-Disposition"
    ] = `attachment; filename*=UTF-8''${encodeURIComponent(finalFilename)}`;
  }

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: respHeaders,
  });
}
