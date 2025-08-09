export type Platform =
  | "douyin"
  | "bilibili"
  | "kuaishou"
  | "weibo"
  | "xhs"
  | "qsmusic";

// 提取文本中的第一个 URL（包含常见分享文案里的 URL）
export function extractUrl(text: string): string | null {
  const urlToken = /(https?:\/\/[^\s，。？！、,.!?:;'"“”‘’()（）<>《》【】]+)/; // 排除常见中英文标点
  const urlPatterns: RegExp[] = [
    urlToken, // 基本URL
    new RegExp(`${urlToken.source}\\s*复制此链接`), // 抖音格式
    new RegExp(`${urlToken.source}\\s*打开[^\\s]+搜索`), // 通用格式
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].trim();
      // 再保险：若 URL 后仍有连接的标点或说明文字，切到首个分隔符
      const splitIndex = candidate.search(
        /[，。？！、,.!?:;'"“”‘’()（）<>《》【】\s]/
      );
      if (splitIndex > -1) {
        candidate = candidate.slice(0, splitIndex);
      }
      return candidate;
    }
  }

  // 支持无协议的短链（如 v.douyin.com/xxxx）
  const bareUrlMatch = text.match(
    /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s，。？！、,.!?:;'"“”‘’()（）<>《》【】]+)/
  );
  if (bareUrlMatch && bareUrlMatch[1]) {
    let candidate = bareUrlMatch[1].trim();
    const splitIndex = candidate.search(
      /[，。？！、,.!?:;'"“”‘’()（）<>《》【】\s]/
    );
    if (splitIndex > -1) {
      candidate = candidate.slice(0, splitIndex);
    }
    return candidate;
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
