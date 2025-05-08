const express = require("express");
const axios = require("axios");
const router = express.Router();

async function douyin(url) {
  try {
    // 构造请求头
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };

    // 尝试从 URL 中获取视频 ID
    let id = await extractId(url);

    // 检查 ID 是否有效
    if (!id) {
      // 访问当前链接获取跳转后的内容
      const response = await axios.get(url, { headers });
      // 获取跳转后的 URL
      const redirectUrl = getRedirectUrl(response.data);
      if (redirectUrl) {
        // 尝试从跳转后的 URL 中获取视频 ID
        id = await extractId(redirectUrl);
      }
    }

    // 检查 ID 是否有效
    if (!id) {
      return { code: 400, msg: "无法解析视频 ID" };
    }

    // 发送请求获取视频信息
    const response = await axios.get(
      `https://www.iesdouyin.com/share/video/${id}`,
      { headers }
    );
    const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)\<\/script>/s;
    const matches = response.data.match(pattern);

    if (!matches || !matches[1]) {
      return { code: 201, msg: "解析失败" };
    }

    const videoInfo = JSON.parse(matches[1].trim());
    if (!videoInfo.loaderData) {
      return { code: 201, msg: "解析失败" };
    }

    // 替换 "playwm" 为 "play"
    const videoResUrl = videoInfo.loaderData[
      "video_(id)/page"
    ].videoInfoRes.item_list[0].video.play_addr.url_list[0].replace(
      "playwm",
      "play"
    );

    // 构造返回数据
    return {
      code: 200,
      msg: "解析成功",
      data: {
        author:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .author.nickname,
        uid: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .author.unique_id,
        avatar:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .author.avatar_medium.url_list[0],
        like: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .statistics.digg_count,
        time: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .create_time,
        title:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .desc,
        cover:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .video.cover.url_list[0],
        url: videoResUrl,
        music: {
          author:
            videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
              .music.author,
          avatar:
            videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
              .music.cover_large.url_list[0],
        },
      },
    };
  } catch (error) {
    console.error("Error:", error);
    return { code: 500, msg: "服务器错误" };
  }
}

async function extractId(url) {
  try {
    const response = await axios.get(url, { maxRedirects: 5 });
    const finalUrl = response.request.res.responseUrl || url;
    const match = finalUrl.match(/[0-9]+/);
    return match ? match[0] : null;
  } catch (error) {
    console.error("Error extracting ID:", error);
    return null;
  }
}

function getRedirectUrl(html) {
  const pattern = /<link data-react-helmet="true" rel="canonical" href="(.*?)"/;
  const match = html.match(pattern);
  return match ? match[1] : null;
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ code: 201, msg: "url为空" });
  }

  try {
    const response = await douyin(url);
    if (!response) {
      return res.status(404).json({ code: 404, msg: "获取失败" });
    }
    res.json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ code: 500, msg: "服务器错误" });
  }
});

module.exports = router;
