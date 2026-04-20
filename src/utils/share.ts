import type { VideoPlatformKey } from "@/config/video-platforms";

export type Platform = VideoPlatformKey;

// 提取文本中的第一个 URL（包含常见分享文案里的 URL）
export function extractUrl(text: string): string | null {
  const httpUrl = text.match(
    /(https?:\/\/[^\s\u3000\u00A0，。！？、；：【】（）《》“”‘’]+)/
  );
  if (httpUrl && httpUrl[1]) {
    return httpUrl[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  const bareUrlMatch = text.match(
    /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s\u3000\u00A0，。！？、；：【】（）《》“”‘’]+)/
  );
  if (bareUrlMatch && bareUrlMatch[1]) {
    return bareUrlMatch[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  return null;
}

/** 是否包含任一受支持平台的 URL 片段（用于剪贴板自动读取等） */
export function hasValidVideoUrl(text: string): boolean {
  const supported = [
    "douyin.com",
    "iesdouyin.com",
    "v.douyin.com",
    "snssdk.com",
    "kuaishou.com",
    "v.kuaishou.com",
    "weibo.com",
    "weibo.cn",
    "video.weibo.com",
    "oasis.weibo.cn",
    "xiaohongshu.com",
    "xhslink.com",
    "bilibili.com",
    "b23.tv",
    "music.douyin.com",
    "h5.pipigx.com",
    "h5.pipix.com",
    "share.huoshan.com",
    "huoshan.com",
    "weishi.qq.com",
    "ixigua.com",
    "xiaochuankeji.cn",
    "xspshare.baidu.com",
    "pearvideo.com",
    "huya.com",
    "acfun.cn",
    "meipai.com",
    "doupai.cc",
    "kg.qq.com",
    "xinpianchang.com",
    "haokan.baidu.com",
    "haokan.hao123.com",
    "twitter.com",
    "x.com",
    "t.co",
    "6.cn",
  ];
  const t = text.toLowerCase();
  return supported.some((d) => t.includes(d));
}

/**
 * 根据文本粗略检测平台（先匹配更具体的域名）
 */
export function detectPlatform(text: string): VideoPlatformKey {
  const firstUrl = extractUrl(text) || "";
  const lower = firstUrl.toLowerCase();

  if (lower.includes("music.douyin.com")) return "qsmusic";
  if (
    lower.includes("t.co/") ||
    lower.includes("twitter.com/") ||
    lower.includes("x.com/")
  ) {
    return "twitter";
  }
  if (lower.includes("b23.tv") || lower.includes("bilibili.com"))
    return "bilibili";
  if (lower.includes("v.huya.com") || lower.includes("huya.com")) return "huya";
  if (lower.includes("acfun.cn")) return "acfun";
  if (lower.includes("pearvideo.com")) return "lishipin";
  if (lower.includes("ixigua.com")) return "xigua";
  if (lower.includes("huoshan.com") || lower.includes("share.huoshan.com"))
    return "huoshan";
  if (lower.includes("weishi.qq.com")) return "weishi";
  if (lower.includes("xiaochuankeji.cn")) return "zuiyou";
  if (lower.includes("xspshare.baidu.com")) return "quanmin";
  if (
    lower.includes("haokan.baidu.com") ||
    lower.includes("haokan.hao123.com")
  ) {
    return "haokan";
  }
  if (lower.includes("meipai.com")) return "meipai";
  if (lower.includes("doupai.cc")) return "doupai";
  if (lower.includes("kg.qq.com")) return "quanminkge";
  if (lower.includes("xinpianchang.com")) return "xinpianchang";
  if (lower.includes("oasis.weibo.cn")) return "lvzhou";

  try {
    const href = firstUrl.startsWith("http")
      ? firstUrl
      : `https://${firstUrl}`;
    const host = new URL(href).hostname.toLowerCase();
    if (host === "weibo.cn") return "lvzhou";
    if (host === "6.cn" || host.endsWith(".6.cn")) return "sixroom";
  } catch {
    /* ignore */
  }

  if (lower.includes("xhslink.com") || lower.includes("xiaohongshu.com"))
    return "xhs";
  if (lower.includes("video.weibo.com")) return "weibo";
  if (lower.includes("weibo.com")) return "weibo";
  if (lower.includes("v.kuaishou.com") || lower.includes("kuaishou.com"))
    return "kuaishou";
  if (lower.includes("h5.pipigx.com")) return "pipigx";
  if (lower.includes("h5.pipix.com")) return "ppxia";
  if (lower.includes("snssdk.com") || lower.includes("douyin.com"))
    return "douyin";

  return "douyin";
}

export function extractUrlFromText(text: string): string | null {
  const httpUrl = text.match(
    /(https?:\/\/[^\s\u3000\u00A0，。！？、；：【】（）《》"'"'"'"]+)/
  );
  if (httpUrl && httpUrl[1]) {
    return httpUrl[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  const bareUrlMatch = text.match(
    /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s\u3000\u00A0，。！？、；：【】（）《》"'"'"'"]+)/
  );
  if (bareUrlMatch && bareUrlMatch[1]) {
    return bareUrlMatch[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  return null;
}
