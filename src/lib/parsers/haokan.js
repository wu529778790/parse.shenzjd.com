/**
 * 好看视频解析（纯函数模块，无 HTTP 边界）
 * 由 /api/haokan 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";


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

export default haokanParse;
