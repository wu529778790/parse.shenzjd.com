/**
 * 全民K歌解析（纯函数模块，无 HTTP 边界）
 * 由 /api/quanminkge 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

async function parseVideoId(videoId) {
  const reqUrl = `https://kg.qq.com/node/play?s=${videoId}`;
  const res = await fetch(reqUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.102 Safari/537.36 Edg/104.0.1293.70",
    },
  });
  const html = await res.text();
  const m = html.match(/window\.__DATA__\s*=\s*(.*?);/s);
  if (!m?.[1]) {
    return { code: 400, msg: "全民K歌页面解析失败" };
  }
  let root;
  try {
    root = JSON.parse(m[1].trim());
  } catch {
    return { code: 400, msg: "全民K歌数据解析失败" };
  }
  const data = root?.detail;
  if (!data?.playurl_video) {
    return { code: 404, msg: "未找到作品播放地址" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.content || "",
      author: data.nick || "",
      avatar: data.avatar || "",
      uid: String(data.uid || ""),
      cover: data.cover || "",
      url: data.playurl_video,
    },
  };
}

async function quanminkgeParse(shareUrl) {
  let s = "";
  try {
    s = new URL(shareUrl).searchParams.get("s") || "";
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!s) {
    return { code: 400, msg: "无法解析参数 s" };
  }
  return parseVideoId(s);
}

export default quanminkgeParse;
