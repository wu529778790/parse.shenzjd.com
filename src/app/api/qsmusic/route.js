import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";

export const runtime = "nodejs";

/**
 * 汽水音乐解析器。
 * 支持两种分享类型：
 *  - track（歌曲）：重定向到 /qishui/share/track?track_id=xxx
 *  - ugc_video（用户视频/MV）：重定向到 /qishui/share/ugc_video?ugc_video_id=xxx
 */
async function getMusicInfo(url) {
  try {
    // 1. 跟随重定向，拿到真实分享页 URL（含 track_id / ugc_video_id）
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const redirectUrl = response.url;

    const trackMatch = redirectUrl.match(/track_id=(\d+)/);
    const ugcMatch = redirectUrl.match(/ugc_video_id=(\d+)/);

    if (!trackMatch && !ugcMatch) {
      return { code: 400, msg: "无法提取音乐ID" };
    }

    // 2. 请求分享页，解析 _ROUTER_DATA
    const pageResponse = await fetch(redirectUrl, {
      signal: AbortSignal.timeout(8000),
    });
    const html = await pageResponse.text();

    const jsJsonPattern = /_ROUTER_DATA\s*=\s*({[\s\S]*?});/;
    const jsJsonMatch = html.match(jsJsonPattern);
    if (!jsJsonMatch) {
      return { code: 404, msg: "未找到音乐信息" };
    }

    const jsonData = JSON.parse(jsJsonMatch[1].trim());
    const loaderData = jsonData.loaderData || {};

    let title = "";
    let cover = "";
    let musicUrl = "";
    let lyrics = "";
    let author = "";

    if (trackMatch) {
      // —— 歌曲类型 ——
      const trackPage = loaderData.track_page || {};
      const audio = trackPage.audioWithLyricsOption || {};
      musicUrl = audio.url || "";
      title = audio.trackName || "";
      cover = audio.coverURL || "";
      author = audio.artistName || "";

      // 解析歌词
      const sentences = audio.lyrics?.sentences || [];
      lyrics = sentences
        .filter((s) => s.startMs && s.words)
        .map((sentence) => {
          const startMs = sentence.startMs;
          const sentenceText = sentence.words.map((w) => w.text).join("");
          const minutes = Math.floor(startMs / 60000);
          const seconds = Math.floor((startMs % 60000) / 1000);
          const milliseconds = startMs % 1000;
          const timeTag = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}]`;
          return timeTag + sentenceText;
        })
        .join("\n");
    } else if (ugcMatch) {
      // —— UGC 视频 / MV 类型 ——
      const videoPage = loaderData.ugc_video_page || {};
      const options = videoPage.videoOptions || {};
      musicUrl = options.url || "";
      title = options.videoName || "";
      cover = options.coverURL || "";
      author = options.artistName || "";
    }

    if (!musicUrl && !title) {
      return { code: 404, msg: "未找到音乐信息" };
    }

    return {
      code: 200,
      msg: "解析成功",
      data: {
        type: "music",
        name: title,
        url: musicUrl,
        cover: cover,
        lyrics: lyrics,
        author: author,
        core: "汽水音乐",
      },
    };
  } catch (error) {
    logger.error("qsmusic parse error:", error);
    return { code: 500, msg: "服务器内部错误" };
  }
}

export const GET = createApiHandler(getMusicInfo);