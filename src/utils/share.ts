export type Platform =
  | "douyin"
  | "bilibili"
  | "kuaishou"
  | "weibo"
  | "xhs"
  | "qsmusic";

// 提取文本中的第一个 URL（包含常见分享文案里的 URL）
export function extractUrl(text: string): string | null {
  const urlPatterns: RegExp[] = [
    /(https?:\/\/[^\s]+)/, // 基本URL
    /(https?:\/\/[^\s]+)\s*复制此链接/, // 抖音格式
    /(https?:\/\/[^\s]+)\s*打开[^\s]+搜索/, // 通用格式
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // 去除末尾可能跟随的中文/英文标点
      return match[1].replace(/[，。！？,.!?:;]+$/, "").trim();
    }
  }

  // 支持无协议的短链（如 v.douyin.com/xxxx）
  const bareUrlMatch = text.match(
    /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s]+)/
  );
  if (bareUrlMatch && bareUrlMatch[1]) {
    return bareUrlMatch[1].replace(/[，。！？,.!?:;]+$/, "").trim();
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
  if (text.includes("douyin.com") || text.includes("snssdk.com"))
    return "douyin";
  if (text.includes("kuaishou.com") || text.includes("v.kuaishou.com"))
    return "kuaishou";
  if (text.includes("weibo.com") || text.includes("video.weibo.com"))
    return "weibo";
  if (text.includes("xiaohongshu.com") || text.includes("xhslink.com"))
    return "xhs";
  if (text.includes("bilibili.com") || text.includes("b23.tv"))
    return "bilibili";
  if (text.includes("music.douyin.com")) return "qsmusic";
  return "douyin"; // 默认平台
}
