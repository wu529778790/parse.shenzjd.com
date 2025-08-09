export type Platform =
  | "douyin"
  | "bilibili"
  | "kuaishou"
  | "weibo"
  | "xhs"
  | "qsmusic";

// 提取文本中的第一个 URL（包含常见分享文案里的 URL）
export function extractUrl(text: string): string | null {
  // 1) 标准 http(s) URL：允许域名中的点和路径的常见字符，仅以空白或中文标点作为边界
  const httpUrl = text.match(
    /(https?:\/\/[^\s\u3000\u00A0，。！？、；：【】（）《》“”‘’]+)/
  );
  if (httpUrl && httpUrl[1]) {
    // 去掉末尾英文标点（逗号、句号等）或中文标点
    return httpUrl[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  // 支持无协议的短链（如 v.douyin.com/xxxx）
  const bareUrlMatch = text.match(
    /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s\u3000\u00A0，。！？、；：【】（）《》“”‘’]+)/
  );
  if (bareUrlMatch && bareUrlMatch[1]) {
    return bareUrlMatch[1].replace(/[，。！？、；：.,!?;]+$/, "");
  }

  return null;
}

// 是否包含受支持平台的 URL
export function hasValidVideoUrl(text: string): boolean {
  const supported = [
    "douyin.com",
    "kuaishou.com",
    "weibo.com",
    "xiaohongshu.com",
    "xhslink.com",
    "bilibili.com",
    "b23.tv",
    "douyinpic.com",
    "snssdk.com",
    "v.kuaishou.com",
  ];
  return supported.some((domain) => text.includes(domain));
}

// 根据文本粗略检测平台（用于前端自动选择）
export function detectPlatform(text: string): Platform {
  const firstUrl = extractUrl(text) || "";
  const lower = firstUrl.toLowerCase();
  if (lower.includes("music.douyin.com")) return "qsmusic";
  if (lower.includes("b23.tv") || lower.includes("bilibili.com"))
    return "bilibili";
  if (lower.includes("v.kuaishou.com") || lower.includes("kuaishou.com"))
    return "kuaishou";
  if (lower.includes("video.weibo.com") || lower.includes("weibo.com"))
    return "weibo";
  if (lower.includes("xhslink.com") || lower.includes("xiaohongshu.com"))
    return "xhs";
  if (lower.includes("snssdk.com") || lower.includes("douyin.com"))
    return "douyin";
  return "douyin"; // 默认平台
}
