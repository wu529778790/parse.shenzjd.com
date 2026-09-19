/**
 * 直链有效性验证（参考 video-unwatermark douyin_browser.py 的 _verify 思路）
 * 解析返回前对直链做 HEAD 校验，避免前端拿到 404 坏链。
 *
 * 策略（保守，绝不误伤好链）：
 * - HEAD 2xx / 3xx（跟随跳转后）→ 通过
 * - 404 / 410 → 先用 GET + Range: bytes=0-0 复核（抖音 CDN 对 HEAD 返回
 *   404 但 GET 可用的情况频繁出现，日志实证），GET 仍 404/410 才判坏链
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
      // HEAD 被部分 CDN 网关误判 404，GET 复核后再下结论
      const get = await probeByGet(url, { timeout, ua });
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
 */
async function probeByGet(url, { timeout, ua }) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": ua, Accept: "*/*", Range: "bytes=0-0" },
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
