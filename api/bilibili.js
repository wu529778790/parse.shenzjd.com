const express = require("express");
const axios = require("axios");
const router = express.Router();

function cleanUrlParameters(url) {
  try {
    const parsed = new URL(url);
    // 移除认证信息
    parsed.username = "";
    parsed.password = "";
    // 移除查询参数
    parsed.search = "";
    // 移除末尾斜杠
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  } catch (error) {
    console.error("Error cleaning URL:", error);
    return url;
  }
}

async function bilibili(url, headers, userAgent, cookie) {
  try {
    const response = await axios.get(url, {
      headers: {
        ...headers,
        "User-Agent": userAgent,
        Cookie: cookie,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error making bilibili request:", error);
    return null;
  }
}

async function getBilibiliVideoInfo(url) {
  try {
    const cleanUrl = cleanUrlParameters(url);
    const parsedUrl = new URL(cleanUrl);

    let bvid;
    if (parsedUrl.hostname === "b23.tv") {
      const response = await axios.get(url, { maxRedirects: 5 });
      const redirectUrl = new URL(response.request.res.responseUrl);
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
    const cookie = process.env.BILIBILI_COOKIE || ""; // 从环境变量获取cookie
    const headers = { "Content-Type": "application/json;charset=UTF-8" };
    const userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36";

    // 获取视频信息
    const videoInfo = await bilibili(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      headers,
      userAgent,
      cookie
    );

    if (!videoInfo || videoInfo.code !== 0) {
      return { code: 0, msg: "解析失败！" };
    }

    const bilijson = [];
    for (const page of videoInfo.data.pages) {
      const playUrl = await bilibili(
        `https://api.bilibili.com/x/player/playurl?otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=${bvid}&cid=${page.cid}&platform=html5&high_quality=1`,
        headers,
        userAgent,
        cookie
      );

      if (playUrl && playUrl.data) {
        bilijson.push({
          title: page.part,
          duration: page.duration,
          durationFormat: new Date((page.duration - 1) * 1000)
            .toISOString()
            .substr(11, 8),
          accept: playUrl.data.accept_description,
          video_url: `https://upos-sz-mirrorhw.bilivideo.com/${
            playUrl.data.durl[0].url.split(".bilivideo.com/")[1]
          }`,
        });
      }
    }

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
    console.error("Error:", error);
    return { code: 0, msg: "解析失败！" };
  }
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ code: 201, msg: "链接不能为空！" });
  }

  try {
    const result = await getBilibiliVideoInfo(url);
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
