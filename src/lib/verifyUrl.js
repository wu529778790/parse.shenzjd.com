/**
 * 直链有效性验证（参考 video-unwatermark douyin_browser.py 的 _verify 思路）
 * 解析返回前对直链做 HEAD 校验，避免前端拿到 404 坏链。
 *
 * 策略（保守，绝不误伤好链）：
 * - 请求头带 UA + 按直链 CDN 匹配的防盗链 Referer（见 REFERER_BY_CDN_HOST），
 *   缺 Referer 时部分 CDN 对好链也回 404，这是抖音直链被误判坏链的根因
 * - HEAD 2xx / 3xx（跟随跳转后）→ 通过
 * - 404 / 410 → 先用 GET + Range: bytes=0-0 复核（抖音 CDN 对 HEAD 返回
 *   404 但 GET 可用的情况频繁出现，日志实证），GET 仍 404/410 才判坏链
 * - 403 / 405 / 超时 / 网络错 → 不确定：部分 CDN 拒绝 HEAD 但 GET 可用，
 *   一律不阻断（uncertain: true）
 */

const DEFAULT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

// 部分视频 CDN 的防盗链校验 Referer：缺失时对好链也回 404（抖音 douyinvod
// 线上实证 2026-09/11）。按直链 host 后缀匹配，匹配不到不带 Referer
// （与原行为一致，避免给不认识的 CDN 乱发头）。
const REFERER_BY_CDN_HOST = [
  { suffix: "douyinvod.com", referer: "https://www.douyin.com/" },
  { suffix: "awsnackvideo.com", referer: "https://www.douyin.com/" },
  { suffix: "zjcdn.com", referer: "https://www.douyin.com/" },
  { suffix: "douyin.com", referer: "https://www.douyin.com/" },
  { suffix: "iesdouyin.com", referer: "https://www.douyin.com/" },
  { suffix: "xhscdn.com", referer: "https://www.xiaohongshu.com/" },
  { suffix: "xiaohongshu.com", referer: "https://www.xiaohongshu.com/" },
  { suffix: "bilivideo.com", referer: "https://www.bilibili.com/" },
  { suffix: "akamaized.net", referer: "https://www.bilibili.com/" },
  { suffix: "hdslb.com", referer: "https://www.bilibili.com/" },
];

/** 取直链所属 CDN 的防盗链 Referer；无匹配返回空串（不发该头） */
export function refererForDirectUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const match = REFERER_BY_CDN_HOST.find(
      (m) => hostname === m.suffix || hostname.endsWith(`.${m.suffix}`)
    );
    return match?.referer || "";
  } catch {
    return "";
  }
}

export async function verifyDirectUrl(url, options = {}) {
  const { timeout = 4000, ua = DEFAULT_UA } = options;
  const referer = refererForDirectUrl(url);
  const headers = { "User-Agent": ua, Accept: "*/*", "Accept-Language": "zh-CN,zh;q=0.9" };
  if (referer) headers.Referer = referer;
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    const status = resp.status;
    if (status >= 200 && status < 400) {
      return { ok: true, status };
    }
    if (status === 404 || status === 410) {
      // HEAD 被部分 CDN 网关误判 404，GET 复核后再下结论
      const get = await probeByGet(url, { timeout, headers });
      if (get.ok) {
        return { ok: true, status: get.status, uncertain: true };
      }
      return { ok: false, status: get.status };
    }
    // 403/405 等：CDN 可能拒绝 HEAD 但 GET 可用 → 不确定，不阻断
    return { ok: true, status, uncertain: true };
  } catch {
    // 超时 / 网络错误：不确定，不阻断
    return { ok: true, status: 0, uncertain: true };
  }
}

/**
 * GET + Range 轻量复核：只取前 1 字节，避免整段视频下载。
 * 200/206 → 链路可用；其余（含再次 404/410）→ 坏链。
 * 复核请求与 HEAD 用同一组头（UA/Referer）：防盗链对 GET 同样生效，
 * 缺 Referer 的 GET 复核会把好链误判成坏链（HEAD 404 → GET 也 404 → 误置空）。
 */
async function probeByGet(url, { timeout, headers }) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { ...headers, Range: "bytes=0-0" },
      signal: AbortSignal.timeout(timeout),
    });
    const status = resp.status;
    // 显式取消响应体，避免连接挂着等数据
    try {
      await resp.body?.cancel();
    } catch {
      /* ignore */
    }
    if (status === 200 || status === 206) {
      return { ok: true, status };
    }
    return { ok: false, status };
  } catch {
    // GET 复核超时/网络错：不能证实坏链，按不确定处理（不阻断）
    return { ok: true, status: 0, uncertain: true };
  }
}

export const _internal = { DEFAULT_UA };
