import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";

export const runtime = "edge";

// 从环境变量获取配置
const BILIBILI_USER_AGENT = process.env.BILIBILI_USER_AGENT || 
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36";

const BILIBILI_COOKIE = process.env.BILIBILI_COOKIE || "";

function cleanUrlParameters(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  } catch (error) {
    logger.error("Error cleaning URL:", error.message);
    return url;
  }
}

async function bilibiliRequest(url, headers) {
  try {
    const response = await fetch(url, {
      headers: {
        ...headers,
        "User-Agent": BILIBILI_USER_AGENT,
        Cookie: BILIBILI_COOKIE,
      },
    });
    return await response.json();
  } catch (error) {
    logger.error("Error making bilibili request:", error.message);
    return null;
  }
}

async function getBilibiliVideoInfo(url) {
  try {
    const cleanUrl = cleanUrlParameters(url);
    const parsedUrl = new URL(cleanUrl);
    let bvid;
    
    if (parsedUrl.hostname === "b23.tv") {
      const response = await fetch(url, { redirect: "follow" });
      const redirectUrl = new URL(response.url);
      bvid = redirectUrl.pathname;
    } else if (
      parsedUrl.hostname === "www.bilibili.com" ||
      parsedUrl.hostname === "m.bilibili.com"
    ) {
      bvid = parsedUrl.pathname;
    } else {
      return { code: -1, msg: "视频链接好像不太对！" };
    }
    
    if (!bvid.includes("/video/")) {
      return { code: -1, msg: "好像不是视频链接" };
    }
    
    bvid = bvid.replace("/video/", "");
    logger.log("Processing bilibili video, bvid:", bvid);
    
    const headers = { "Content-Type": "application/json;charset=UTF-8" };
    
    // 获取视频信息
    const videoInfo = await bilibiliRequest(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      headers
    );
    
    if (!videoInfo || videoInfo.code !== 0) {
      logger.warn("Failed to fetch video info, response:", videoInfo);
      return { code: 0, msg: "解析失败！" };
    }
    
    // 并行获取所有分P的播放地址
    const playUrlPromises = videoInfo.data.pages.map(async (page) => {
      const playUrl = await bilibiliRequest(
        `https://api.bilibili.com/x/player/playurl?otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=${bvid}&cid=${page.cid}&platform=html5&high_quality=1`,
        headers
      );
      
      if (playUrl && playUrl.data) {
        return {
          title: page.part,
          duration: page.duration,
          durationFormat: new Date((page.duration - 1) * 1000)
            .toISOString()
            .substr(11, 8),
          accept: playUrl.data.accept_description,
          video_url: `https://upos-sz-mirrorhw.bilivideo.com/${
            playUrl.data.durl[0].url.split(".bilivideo.com/")[1]
          }`,
        };
      }
      return null;
    });
    
    const bilijson = (await Promise.all(playUrlPromises)).filter(Boolean);
    
    logger.log("Successfully parsed bilibili video, pages:", bilijson.length);
    
    return {
      code: 1,
      msg: "解析成功！",
      title: videoInfo.data.title,
      imgurl: videoInfo.data.pic,
      desc: videoInfo.data.desc,
      data: bilijson,
      user: {
        name: videoInfo.data.owner.name,
        user_img: videoInfo.data.owner.face,
      },
    };
  } catch (error) {
    logger.error("Error parsing bilibili video:", error.message);
    return { code: 0, msg: "解析失败！" };
  }
}

export const GET = createApiHandler(getBilibiliVideoInfo);
