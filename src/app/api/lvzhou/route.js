import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

/**
 * 用正则从 HTML 中提取内容（替代 linkedom）
 */
function extractFromHtml(html) {
  const result = {};

  // 提取 video src
  const videoMatch = html.match(/<video[^>]+src="([^"]+)"/);
  if (videoMatch?.[1]) {
    result.videoUrl = videoMatch[1];
  }

  // 提取作者头像
  const avatarMatch = html.match(/<a[^>]+class="avatar"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (avatarMatch?.[1]) {
    result.authorAvatar = avatarMatch[1];
  }

  // 提取视频封面
  const coverMatch = html.match(/background-image:url\(([^)]+)\)/);
  if (coverMatch?.[1]) {
    result.coverUrl = coverMatch[1];
  }

  // 提取标题
  const titleMatch = html.match(/class="status-title"[^>]*>([^<]+)<\/div>/);
  if (titleMatch?.[1]) {
    result.title = titleMatch[1].trim();
  }

  // 提取作者名
  const authorMatch = html.match(/class="nickname"[^>]*>([^<]+)<\/div>/);
  if (authorMatch?.[1]) {
    result.author = authorMatch[1].trim();
  }

  return result;
}

async function lvzhouParse(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const html = await res.text();

  const extracted = extractFromHtml(html);

  if (!extracted.videoUrl) {
    return { code: 404, msg: "绿洲页面未找到视频" };
  }

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: extracted.title || "",
      author: extracted.author || "",
      avatar: extracted.authorAvatar || "",
      cover: extracted.coverUrl || "",
      url: extracted.videoUrl,
    },
  };
}

export const GET = createApiHandler(lvzhouParse);
