/**
 * 视频代理 URL 工具：判断视频直链是否需要走 /api/video-proxy 代理。
 *
 * 背景：小红书 xhscdn 视频 CDN 有 Referer 防盗链，直链在新窗口打开/播放会 403。
 * 通过 /api/video-proxy 代理（带 Referer: xiaohongshu.com）即可正常播放和下载。
 * 其他平台（B站/微博/快手等）直链通常可正常播放，无需代理。
 */

/** 需要走代理的 CDN 主机（Referer 防盗链） */
const PROXY_HOST_SUFFIXES = [".xhscdn.com", "xhscdn.com"];

/** 判断视频 URL 是否需要走代理 */
export function needsVideoProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PROXY_HOST_SUFFIXES.some((s) => hostname === s || hostname.endsWith(s));
  } catch {
    return false;
  }
}

/** 生成视频代理 URL（无需代理时原样返回） */
export function buildVideoProxyUrl(url: string): string {
  if (!needsVideoProxy(url)) return url;
  return `/api/video-proxy?url=${encodeURIComponent(url)}`;
}