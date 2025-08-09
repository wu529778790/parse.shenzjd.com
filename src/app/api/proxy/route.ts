export const runtime = "edge";

import { NextRequest } from "next/server";

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

  const DEFAULT_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  function guessRefererByHost(hostname: string): string | undefined {
    if (hostname.includes("douyin")) return "https://www.douyin.com/";
    if (hostname.includes("bilibili")) return "https://www.bilibili.com/";
    if (hostname.includes("kuaishou")) return "https://www.kuaishou.com/";
    if (hostname.includes("weibo")) return "https://weibo.com/";
    if (hostname.includes("xiaohongshu") || hostname.includes("xhs"))
      return "https://www.xiaohongshu.com/";
    if (hostname.includes("douyinpic") || hostname.includes("snssdk"))
      return "https://www.douyin.com/";
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

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": customUA || req.headers.get("user-agent") || DEFAULT_UA,
  };
  const fwdRange = req.headers.get("range");
  if (fwdRange) upstreamHeaders["Range"] = fwdRange;
  const refererToUse = customReferer || guessRefererByHost(parsed.hostname);
  if (refererToUse) upstreamHeaders["Referer"] = refererToUse;

  const upstreamResp = await fetch(targetUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
  });

  const contentType =
    overrideContentType ||
    upstreamResp.headers.get("content-type") ||
    "application/octet-stream";

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
    "Content-Type": contentType,
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
