/**
 * 付费 / DRM 平台黑名单
 * 参考 video-unwatermark（Apache-2.0）config.py 的 BLOCKED_HOSTS。
 * 这些平台内容受会员/版权保护，解析器不提供支持，命中时直接给出明确提示，
 * 避免白费流量解析半天后失败。
 */

// 域名后缀 → 平台名（用于给用户明确的错误提示）
export const BLOCKED_HOSTS: Record<string, string> = {
  "v.qq.com": "腾讯视频",
  "film.qq.com": "腾讯视频",
  "wetv.vip": "腾讯视频",
  "wetv.video": "腾讯视频",
  "iqiyi.com": "爱奇艺",
  "iq.com": "爱奇艺",
  "youku.com": "优酷",
  "soku.com": "优酷",
  "mgtv.com": "芒果TV",
  "hunantv.com": "芒果TV",
  "netflix.com": "Netflix",
  "disneyplus.com": "Disney+",
  "disney.com": "Disney+",
  "hbo.com": "HBO",
  "hbomax.com": "HBO",
  "max.com": "HBO",
  "primevideo.com": "Prime Video",
  "spotify.com": "Spotify",
  "hulu.com": "Hulu",
};

// 微信视频号：拒绝登录态抓取 / MITM 类方案
const WECHAT_CHANNELS_HINTS = [
  "channels.weixin.qq.com",
  "weixin.qq.com/sph",
  "weixin.qq.com/tv",
];

// 文本尾部可清理的标点（分享文案常把 URL 与中文标点粘在一起）
const TRAIL_PUNCT = ".,;:!?)]}>\"'`，。；：！？、）】」』》…";

/**
 * 判断输入（分享文案 / URL）是否命中黑名单。
 * @returns 命中的平台名（中文），未命中返回 null
 */
export function isBlockedText(text: string): string | null {
  const raw = (text || "").trim();
  if (!raw) return null;

  // 微信视频号特征：直接在原文匹配（域名特征在任意位置出现即可）
  const lowered = raw.toLowerCase();
  for (const hint of WECHAT_CHANNELS_HINTS) {
    if (lowered.includes(hint)) return "微信视频号（暂不支持解析）";
  }

  // 提取第一个 http(s) URL；已是裸 URL 时直接用
  let url = raw;
  const m = raw.match(/https?:\/\/[^\s<>"'`]+/i);
  if (m) {
    url = m[0].replace(new RegExp(`[${TRAIL_PUNCT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+$`), "");
  }

  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (!host) return null;
    for (const [suffix, name] of Object.entries(BLOCKED_HOSTS)) {
      if (host === suffix || host.endsWith(`.${suffix}`)) return name;
    }
  } catch {
    /* 非法 URL 交给上层平台识别处理 */
  }
  return null;
}

export const _internal = { TRAIL_PUNCT };
