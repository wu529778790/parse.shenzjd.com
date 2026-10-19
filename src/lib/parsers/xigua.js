/**
 * 西瓜视频解析（纯函数模块，无 HTTP 边界）
 * 由 /api/xigua 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { logger } from "@/lib/api-utils";
import { getRedirectLocation } from "@/lib/redirect-location";


const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36";
const BASE_COOKIE =
  "MONITOR_WEB_ID=7892c49b-296e-4499-8704-e47c1b150c18; ixigua-a-s=1; ttcid=af99669b6304453480454f150701d5c226; BD_REF=1";

// 2026-10-19 线上验证：西瓜改版后，分享页 SSR 只在请求带 ttwid Cookie 时
// 才在 _ROUTER_DATA 里下发 videoInfoRes（否则仅有 itemId，播放地址缺失）。
// ttwid 通过任意 m.ixigua.com 页面的 Set-Cookie 获取，进程内缓存即可
//（服务端签发，有效期极长）。
let cachedTtwid = "";

async function ensureTtwid(bootstrapUrl) {
  if (cachedTtwid) return cachedTtwid;
  try {
    const res = await fetch(bootstrapUrl, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const m = c.match(/ttwid=([^;]+)/);
      if (m?.[1]) {
        cachedTtwid = m[1];
        break;
      }
    }
  } catch (e) {
    logger.warn("xigua ttwid", e.message);
  }
  return cachedTtwid;
}

function buildHeaders(ttwid) {
  return {
    "User-Agent": UA,
    Cookie: ttwid ? `${BASE_COOKIE}; ttwid=${ttwid}` : BASE_COOKIE,
  };
}

async function parseVideoId(videoId) {
  const reqUrl = `https://m.ixigua.com/douyin/share/video/${videoId}?aweme_type=107&schema_type=1&utm_source=copy&utm_campaign=client_share&utm_medium=android&app=aweme`;
  const res = await fetch(reqUrl, {
    headers: buildHeaders(
      await ensureTtwid(`https://m.ixigua.com/video/${videoId}`),
    ),
  });
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
  // m.ixigua.com/video/<id> 与 www.ixigua.com/<id> 是最终页（200 直出），
  // 不是短链、不会 302，先按已含视频 ID 的链接直接提取（2026-10-19 线上日志：
  // 该形态链接一律误报「无法获取西瓜短链重定向」）。
  try {
    const u = new URL(shareUrl);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    let directId = "";
    if (/^m\.ixigua\.com$/.test(u.hostname)) {
      const m = path.match(/^video\/(\d+)$/);
      if (m) directId = m[1];
    } else if (/^(www\.)?ixigua\.com$/.test(u.hostname)) {
      if (/^\d+$/.test(path)) directId = path;
    }
    if (directId) {
      return parseVideoId(directId);
    }
  } catch {
    // URL 解析失败则继续走短链流程
  }

  // 短链 302 本身无需 ttwid，视频信息获取在 parseVideoId 内引导
  const loc = await getRedirectLocation(shareUrl, buildHeaders(""));
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

export default xiguaParse;
