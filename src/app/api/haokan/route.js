import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://haokan.baidu.com/v?_format=json&vid=${videoId}`;
  const res = await fetch(reqUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const json = await res.json();
  if (json.errno !== 0) {
    return { code: 400, msg: json.error || "好看视频接口错误" };
  }
  const data = json.data?.apiData?.curVideoMeta;
  if (!data?.playurl) {
    return { code: 404, msg: "未找到播放地址" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.title || "",
      author: data.mth?.author_name || "",
      avatar: data.mth?.author_photo || "",
      uid: String(data.mth?.mthid || ""),
      cover: data.poster || "",
      url: data.playurl,
    },
  };
}

async function haokanParse(shareUrl) {
  let vid = "";
  try {
    vid = new URL(shareUrl).searchParams.get("vid") || "";
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!vid) {
    return { code: 400, msg: "无法解析 vid" };
  }
  return parseVideoId(vid);
}

export const GET = createApiHandler(haokanParse);
