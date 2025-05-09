export const runtime = "edge";

async function getMusicInfo(url = "") {
  try {
    let trackId;
    if (url.includes("qishui.douyin.com")) {
      const response = await fetch(url, { redirect: "follow" });
      const redirectUrl = response.url;
      const match = redirectUrl.match(/track_id=(\d+)/);
      trackId = match[1];
    } else {
      const match = url.match(/track_id=(\d+)/);
      trackId = match[1];
    }
    const response = await fetch(
      `https://music.douyin.com/qishui/share/track?track_id=${trackId}`
    );
    const html = await response.text();
    const ldJsonPattern =
      /<script data-react-helmet="true" type="application\/ld\+json">(.*?)<\/script>/s;
    const ldJsonMatch = html.match(ldJsonPattern);
    let title = "";
    let cover = "";
    if (ldJsonMatch) {
      const ldJsonData = JSON.parse(decodeURIComponent(ldJsonMatch[1]));
      title = ldJsonData.title || "";
      cover = ldJsonData.images?.[0] || "";
    }
    const jsJsonPattern =
      /<script\s+async=""\s+data-script-src="modern-inline">_ROUTER_DATA\s*=\s*({[\s\S]*?});/;
    const jsJsonMatch = html.match(jsJsonPattern);
    let musicUrl = "";
    let lyrics = "";
    if (jsJsonMatch) {
      const jsonData = JSON.parse(jsJsonMatch[1].trim());
      musicUrl =
        jsonData.loaderData?.track_page?.audioWithLyricsOption?.url || "";
      const lrcLyrics = [];
      const sentences =
        jsonData.loaderData?.track_page?.audioWithLyricsOption?.lyrics
          ?.sentences || [];
      for (const sentence of sentences) {
        if (sentence.startMs && sentence.endMs && sentence.words) {
          const startMs = sentence.startMs;
          const sentenceText = sentence.words.map((word) => word.text).join("");
          const minutes = Math.floor(startMs / 60000);
          const seconds = Math.floor((startMs % 60000) / 1000);
          const milliseconds = startMs % 1000;
          const timeTag = `[${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}]`;
          lrcLyrics.push(timeTag + sentenceText);
        }
      }
      lyrics = lrcLyrics.join("\n");
    }
    const info = {
      name: title,
      url: musicUrl,
      cover: cover,
      lyrics: lyrics,
      core: "抖音汽水音乐解析",
      copyright: "接口编写:JH-Ahua 接口编写:JH-Ahua 2025-4-20",
    };
    if (Object.keys(info).length > 0) {
      return info;
    } else {
      return { msg: "没有找到相关音乐" };
    }
  } catch (error) {
    return { msg: "解析失败", error: error };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { code: 404, msg: "请补全参数" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
  try {
    const result = await getMusicInfo(url);
    return Response.json(result, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    return Response.json(
      { code: 500, msg: "服务器错误", error: error },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
