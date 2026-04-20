import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import { getRedirectLocation } from "@/lib/redirect-location";

export const runtime = "nodejs";

const PAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
  Cookie:
    "MONITOR_WEB_ID=7892c49b-296e-4499-8704-e47c1b150c18; ixigua-a-s=1; ttcid=af99669b6304453480454f150701d5c226; BD_REF=1",
};

async function parseVideoId(videoId) {
  const reqUrl = `https://m.ixigua.com/douyin/share/video/${videoId}?aweme_type=107&schema_type=1&utm_source=copy&utm_campaign=client_share&utm_medium=android&app=aweme`;
  const res = await fetch(reqUrl, { headers: PAGE_HEADERS });
  const html = await res.text();
  const re = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/is;
  const m = html.match(re);
  if (!m?.[1]) {
    return { code: 400, msg: "西瓜页面解析失败" };
  }
  let json;
  try {
    json = JSON.parse(m[1].trim());
  } catch (e) {
    logger.warn("xigua json", e.message);
    return { code: 400, msg: "西瓜数据 JSON 解析失败" };
  }
  const videoData =
    json?.loaderData?.["video_(id)/page"]?.videoInfoRes?.item_list?.[0];
  if (!videoData?.video?.play_addr?.url_list?.[0]) {
    return { code: 404, msg: "未找到播放地址" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: videoData.desc || "",
      author: videoData.author?.nickname || "",
      avatar: videoData.author?.avatar_thumb?.url_list?.[0] || "",
      uid: String(videoData.author?.user_id || ""),
      cover: videoData.video?.cover?.url_list?.[0] || "",
      url: videoData.video.play_addr.url_list[0],
    },
  };
}

async function xiguaParse(shareUrl) {
  const loc = await getRedirectLocation(shareUrl, PAGE_HEADERS);
  if (!loc) {
    return { code: 400, msg: "无法获取西瓜短链重定向" };
  }
  let path = "";
  try {
    path = new URL(loc).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return { code: 400, msg: "短链无效" };
  }
  const videoId = path.replace(/^video\//, "");
  if (!videoId) {
    return { code: 400, msg: "无法解析视频 id" };
  }
  return parseVideoId(videoId);
}

export const GET = createApiHandler(xiguaParse);
