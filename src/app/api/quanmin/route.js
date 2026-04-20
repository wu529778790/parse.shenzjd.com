import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://quanmin.hao222.com/wise/growth/api/sv/immerse?source=share-h5&pd=qm_share_mvideo&_format=json&vid=${videoId}`;
  const res = await fetch(reqUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const json = await res.json();
  if (json.errno !== 0) {
    return { code: 400, msg: json.error || "度小视接口错误" };
  }
  const statusText = json.data?.meta?.statusText;
  if (statusText) {
    return { code: 400, msg: statusText };
  }
  const data = json.data;
  const videoUrl = data?.meta?.video_info?.clarityUrl?.[1]?.url;
  if (!videoUrl) {
    return { code: 404, msg: "未找到视频地址" };
  }
  let title = data?.meta?.title || "";
  if (!title) {
    title = data?.shareInfo?.title || "";
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title,
      author: data?.author?.name || "",
      avatar: data?.author?.icon || "",
      uid: String(data?.author?.id || ""),
      cover: data?.meta?.image || "",
      url: videoUrl,
    },
  };
}

async function quanminParse(shareUrl) {
  let videoId = "";
  try {
    videoId = new URL(shareUrl).searchParams.get("vid") || "";
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!videoId) {
    return { code: 400, msg: "无法解析 vid" };
  }
  return parseVideoId(videoId);
}

export const GET = createApiHandler(quanminParse);
