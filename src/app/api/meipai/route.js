import { parseHTML } from "linkedom";
import { createApiHandler } from "@/lib/api-middleware";
import { decodeMeipaiVideoBs64 } from "@/lib/meipai-decode";

export const runtime = "nodejs";

async function meipaiParse(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
    },
  });
  const html = await res.text();
  const { document } = parseHTML(html);
  const btn = document.querySelector("#shareMediaBtn");
  const videoBs64 = btn?.getAttribute?.("data-video");
  if (!videoBs64) {
    return { code: 404, msg: "无法解析美拍视频参数" };
  }
  let videoUrl;
  try {
    videoUrl = decodeMeipaiVideoBs64(videoBs64);
  } catch {
    return { code: 400, msg: "美拍地址解码失败" };
  }
  const coverUrl =
    document.querySelector("#detailVideo img")?.getAttribute?.("src") || "";
  const userName =
    document.querySelector(".detail-avatar")?.getAttribute?.("alt") || "";
  let userAvatar =
    document.querySelector(".detail-avatar")?.getAttribute?.("src") || "";
  if (userAvatar && !userAvatar.startsWith("http")) {
    userAvatar = `https:${userAvatar}`;
  }
  const title =
    document.querySelector(".detail-cover-title")?.textContent?.trim() || "";

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title,
      author: userName,
      avatar: userAvatar,
      cover: coverUrl.startsWith("//") ? `https:${coverUrl}` : coverUrl,
      url: videoUrl,
    },
  };
}

export const GET = createApiHandler(meipaiParse);
