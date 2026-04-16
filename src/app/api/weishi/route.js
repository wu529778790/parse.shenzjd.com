import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://h5.weishi.qq.com/webapp/json/weishi/WSH5GetPlayPage?feedid=${videoId}`;
  const res = await fetch(reqUrl, {
    headers: { "User-Agent": DEFAULT_MOBILE_UA },
  });
  const json = await res.json();
  if (json.ret !== 0) {
    return { code: 400, msg: json.msg || "微视接口错误" };
  }
  const errMsg = json.data?.errmsg;
  if (errMsg) {
    return { code: 400, msg: errMsg };
  }
  const data = json.data?.feeds?.[0];
  if (!data?.video_url) {
    return { code: 404, msg: "未找到视频" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.feed_desc_withat || "",
      author: data.poster?.nick || "",
      avatar: data.poster?.avatar || "",
      cover: data.images?.[0]?.url || "",
      url: data.video_url,
    },
  };
}

async function weishiParse(shareUrl) {
  let videoId = "";
  try {
    videoId = new URL(shareUrl).searchParams.get("id") || "";
  } catch {
    return { code: 400, msg: "链接格式无效" };
  }
  if (!videoId) {
    return { code: 400, msg: "无法从分享链接解析视频 id" };
  }
  return parseVideoId(videoId);
}

export const GET = createApiHandler(weishiParse);
