import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://v.6.cn/coop/mobile/index.php?padapi=minivideo-watchVideo.php&av=3.0&encpass=&logiuid=&isnew=1&from=0&vid=${videoId}`;
  const res = await fetch(reqUrl, {
    headers: {
      Referer: `https://m.6.cn/v/${videoId}`,
      "User-Agent": DEFAULT_MOBILE_UA,
    },
  });
  const json = await res.json();
  const data = json?.content;
  if (!data?.playurl) {
    return { code: 404, msg: "六间房解析失败" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.title || "",
      author: data.alias || "",
      avatar: data.picuser || "",
      cover: data.picurl || "",
      url: data.playurl,
    },
  };
}

async function sixroomParse(shareUrl) {
  let videoId = "";
  try {
    const u = new URL(shareUrl);
    if (shareUrl.includes("watchMini.php?vid=")) {
      videoId = u.searchParams.get("vid") || "";
    } else {
      videoId = u.pathname.replace(/^\/v\//, "").replace(/\/$/, "");
    }
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!videoId) {
    return { code: 400, msg: "无法解析 vid" };
  }
  return parseVideoId(videoId);
}

export const GET = createApiHandler(sixroomParse);
