/**
 * 直链有效性验证（参考 video-unwatermark douyin_browser.py 的 _verify 思路）
 * 解析返回前对直链做 HEAD 校验，避免前端拿到 404 坏链。
 *
 * 策略（保守，绝不误伤好链）：
 * - HEAD 2xx / 3xx（跟随跳转后）→ 通过
 * - 404 / 410 → 明确坏链（视频已删除），返回 ok:false
 * - 403 / 405 / 超时 / 网络错 → 不确定：部分 CDN 拒绝 HEAD 但 GET 可用，
 *   一律不阻断（uncertain: true）
 */

const DEFAULT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

export async function verifyDirectUrl(url, options = {}) {
  const { timeout = 4000, ua = DEFAULT_UA } = options;
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": ua, Accept: "*/*" },
      signal: AbortSignal.timeout(timeout),
    });
    const status = resp.status;
    if (status >= 200 && status < 400) {
      return { ok: true, status };
    }
    if (status === 404 || status === 410) {
      return { ok: false, status };
    }
    // 403/405 等：CDN 可能拒绝 HEAD 但 GET 可用 → 不确定，不阻断
    return { ok: true, status, uncertain: true };
  } catch {
    // 超时 / 网络错误：不确定，不阻断
    return { ok: true, status: 0, uncertain: true };
  }
}

export const _internal = { DEFAULT_UA };
