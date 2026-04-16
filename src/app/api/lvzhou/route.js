import { parseHTML } from "linkedom";
import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function lvzhouParse(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const html = await res.text();
  const { document } = parseHTML(html);
  const videoUrl = document.querySelector("video")?.getAttribute?.("src") || "";
  const authorAvatar =
    document.querySelector("a.avatar img")?.getAttribute?.("src") || "";
  const videoCoverStyle =
    document.querySelector("div.video-cover")?.getAttribute?.("style") || "";
  let coverUrl = "";
  const cm = videoCoverStyle.match(/background-image:url\((.*)\)/);
  if (cm?.[1]) {
    coverUrl = cm[1];
  }
  const title =
    document.querySelector("div.status-title")?.textContent?.trim() || "";
  const author =
    document.querySelector("div.nickname")?.textContent?.trim() || "";

  if (!videoUrl) {
    return { code: 404, msg: "绿洲页面未找到视频" };
  }

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title,
      author,
      avatar: authorAvatar,
      cover: coverUrl,
      url: videoUrl,
    },
  };
}

export const GET = createApiHandler(lvzhouParse);
