/**
 * 梨视频解析（纯函数模块，无 HTTP 边界）
 * 由 /api/lishipin 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

async function parseVideoId(videoId) {
  const mrd = Math.floor(Date.now() / 1000);
  const reqUrl = `https://www.pearvideo.com/videoStatus.jsp?contId=${videoId}&mrd=${mrd}`;
  const res = await fetch(reqUrl, {
    headers: {
      Referer: `https://www.pearvideo.com/detail_${videoId}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
    },
  });
  const json = await res.json();
  const videoInfo = json.videoInfo;
  if (!videoInfo?.videos?.srcUrl) {
    return { code: 404, msg: "梨视频数据缺失" };
  }
  const timer = String(json.systemTime || "");
  const videoSrcUrl = videoInfo.videos.srcUrl;
  const videoUrl = timer
    ? videoSrcUrl.replace(timer, `cont-${videoId}`)
    : videoSrcUrl;
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: "",
      author: "",
      avatar: "",
      cover: videoInfo.video_image || "",
      url: videoUrl,
    },
  };
}

async function lishipinParse(shareUrl) {
  let path = "";
  try {
    path = new URL(shareUrl).pathname;
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  const videoId = path.replace(/^\/detail_/, "").replace(/\/$/, "");
  if (!videoId) {
    return { code: 400, msg: "无法解析视频 id" };
  }
  return parseVideoId(videoId);
}

export default lishipinParse;
