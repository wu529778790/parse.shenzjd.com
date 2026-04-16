import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://v2.doupai.cc/topic/${videoId}.json`;
  const res = await fetch(reqUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const json = await res.json();
  const data = json?.data;
  if (!data?.videoUrl) {
    return { code: 404, msg: "逗拍解析失败" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.name || "",
      author: data.userId?.name || "",
      avatar: data.userId?.avatar || "",
      uid: String(data.userId?.id || ""),
      cover: data.imageUrl || "",
      url: data.videoUrl,
    },
  };
}

async function doupaiParse(shareUrl) {
  let id = "";
  try {
    id = new URL(shareUrl).searchParams.get("id") || "";
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!id) {
    return { code: 400, msg: "无法解析逗拍 id" };
  }
  return parseVideoId(id);
}

export const GET = createApiHandler(doupaiParse);
