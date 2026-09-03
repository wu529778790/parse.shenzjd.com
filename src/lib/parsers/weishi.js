/**
 * 微视解析（纯函数模块，无 HTTP 边界）
 * 由 /api/weishi 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";


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

export default weishiParse;
