import { createApiHandler } from "@/lib/api-middleware";
import { decodeMeipaiVideoBs64 } from "@/lib/meipai-decode";

export const runtime = "nodejs";

/**
 * 用正则从 HTML 中提取内容（替代 linkedom）
 */
function extractFromHtml(html) {
  const result = {};

  // 提取 video data-video 属性
  const videoMatch = html.match(/data-video="([^"]+)"/);
  if (videoMatch?.[1]) {
    result.videoBs64 = videoMatch[1];
  }

  // 提取封面图
  const coverMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/g);
  if (coverMatch?.[0]) {
    const srcMatch = coverMatch[0].match(/src="([^"]+)"/);
    result.cover = srcMatch?.[1] || "";
  }

  // 提取用户名
  const userNameMatch = html.match(/class="detail-avatar"[^>]+alt="([^"]+)"/);
  if (userNameMatch?.[1]) {
    result.userName = userNameMatch[1];
  }

  // 提取用户头像
  const avatarMatch = html.match(/class="detail-avatar"[^>]+src="([^"]+)"/);
  if (avatarMatch?.[1]) {
    result.userAvatar = avatarMatch[1];
  }

  // 提取标题
  const titleMatch = html.match(/class="detail-cover-title"[^>]*>([^<]+)<\/div>/);
  if (titleMatch?.[1]) {
    result.title = titleMatch[1].trim();
  }

  return result;
}

async function meipaiParse(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
    },
  });
  const html = await res.text();

  const extracted = extractFromHtml(html);

  if (!extracted.videoBs64) {
    return { code: 404, msg: "无法解析美拍视频参数" };
  }

  let videoUrl;
  try {
    videoUrl = decodeMeipaiVideoBs64(extracted.videoBs64);
  } catch {
    return { code: 400, msg: "美拍地址解码失败" };
  }

  let userAvatar = extracted.userAvatar || "";
  if (userAvatar && !userAvatar.startsWith("http")) {
    userAvatar = `https:${userAvatar}`;
  }

  let coverUrl = extracted.cover || "";
  if (coverUrl.startsWith("//")) {
    coverUrl = `https:${coverUrl}`;
  }

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: extracted.title || "",
      author: extracted.userName || "",
      avatar: userAvatar,
      cover: coverUrl,
      url: videoUrl,
    },
  };
}

export const GET = createApiHandler(meipaiParse);
