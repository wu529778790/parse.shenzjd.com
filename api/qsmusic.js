const express = require("express");
const axios = require("axios");
const router = express.Router();

async function getMusicInfo(type = "json", url = "") {
  try {
    let trackId;
    if (url.includes("qishui.douyin.com")) {
      const response = await axios.get(url, { maxRedirects: 5 });
      const redirectUrl = response.request.res.responseUrl;
      const match = redirectUrl.match(/track_id=(\d+)/);
      trackId = match[1];
    } else {
      const match = url.match(/track_id=(\d+)/);
      trackId = match[1];
    }

    const response = await axios.get(
      `https://music.douyin.com/qishui/share/track?track_id=${trackId}`
    );
    const html = response.data;

    // 匹配 application/ld+json 数据，获取标题和封面
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

    // 匹配 _ROUTER_DATA
    const jsJsonPattern =
      /<script\s+async=""\s+data-script-src="modern-inline">_ROUTER_DATA\s*=\s*({[\s\S]*?});/;
    const jsJsonMatch = html.match(jsJsonPattern);
    let musicUrl = "";
    let lyrics = "";

    if (jsJsonMatch) {
      const jsonData = JSON.parse(jsJsonMatch[1].trim());
      musicUrl =
        jsonData.loaderData?.track_page?.audioWithLyricsOption?.url || "";

      // 提取歌词
      const lrcLyrics = [];
      const sentences =
        jsonData.loaderData?.track_page?.audioWithLyricsOption?.lyrics
          ?.sentences || [];

      for (const sentence of sentences) {
        if (sentence.startMs && sentence.endMs && sentence.words) {
          const startMs = sentence.startMs;
          const sentenceText = sentence.words.map((word) => word.text).join("");

          // 将毫秒转换为 LRC 格式的时间标签
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

    // 构建结果对象
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
    console.error("Error:", error);
    return { msg: "解析失败" };
  }
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  const type = req.query.type || "json";

  if (!url) {
    return res.status(400).json({
      code: 404,
      msg: "请补全参数",
    });
  }

  try {
    const result = await getMusicInfo(type, url);
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      code: 500,
      msg: "服务器错误",
    });
  }
});

module.exports = router;
