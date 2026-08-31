/**
 * 视频代理 URL 工具：判断视频直链是否需要走 /api/video-proxy 代理。
 *
 * 需要代理的场景：Referer 防盗链。小红书 xhscdn 视频 CDN 直链在新窗口
 * 打开/播放会 403，通过 /api/video-proxy 代理（带 Referer: xiaohongshu.com）
 * 即可正常播放和下载。
 *
 * 抖音视频：默认用直链播放（省服务器流量）。抖音 CDN 会随机返回 ftyp box
 * size 被混淆的 MP4（首字节 00→01）导致播放器无法解析，此时由前端检测
 * 到混淆后回退到代理（见 detectDouyinFtypObfuscation），代理会修复该混淆。
 * 其他平台（B站/微博/快手等）直链通常可正常播放，无需代理。
 */

/** 需要走代理的 CDN 主机（Referer 防盗链） */
const PROXY_HOST_SUFFIXES = [".xhscdn.com", "xhscdn.com"];

/** 抖音视频 CDN 主机（ftyp 头混淆，需前端检测后按需回退代理） */
const DOUYIN_VIDEO_HOST_SUFFIXES = [
  ".365yg.com",
  "365yg.com",
  ".douyinvod.com",
  "douyinvod.com",
  ".douyinstatic.com",
  "douyinstatic.com",
];

/** 判断视频 URL 是否需要走代理（小红书等 Referer 防盗链） */
export function needsVideoProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PROXY_HOST_SUFFIXES.some(
      (s) => hostname === s || hostname.endsWith(s)
    );
  } catch {
    return false;
  }
}

/** 判断是否为抖音视频 CDN 直链 */
export function isDouyinVideoUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DOUYIN_VIDEO_HOST_SUFFIXES.some(
      (s) => hostname === s || hostname.endsWith(s)
    );
  } catch {
    return false;
  }
}

/** 生成视频代理 URL（无需代理时原样返回） */
export function buildVideoProxyUrl(url: string): string {
  if (!needsVideoProxy(url)) return url;
  return `/api/video-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * 检测抖音 MP4 直链的 ftyp 头是否被混淆。
 * 抖音 CDN 会随机把 ftyp box 的 size 字段首字节从 0x00 改成 0x01
 * （如 0x00000020 → 0x01000020），使播放器无法解析。
 * 通过 Range 请求读取前 8 字节检测；被混淆返回 true。
 * 非抖音域名 / 请求失败时返回 false（失败时按直链处理，播放器自行兜底）。
 */
export async function detectDouyinFtypObfuscation(
  url: string
): Promise<boolean> {
  if (!isDouyinVideoUrl(url)) return false;
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-8" },
      cache: "no-store",
      // 抖音 CDN 对非抖音 Referer 返回 403，必须去掉 Referer 才能拿到真实数据
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 8) return false;
    // 第 4-7 字节应为 "ftyp"
    if (
      buf[4] !== 0x66 ||
      buf[5] !== 0x74 ||
      buf[6] !== 0x79 ||
      buf[7] !== 0x70
    ) {
      return false;
    }
    // size 首字节为 0x01 视为被混淆（正常应为 0x00）
    return buf[0] === 0x01;
  } catch {
    return false;
  }
}