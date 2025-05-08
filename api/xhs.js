const express = require("express");
const axios = require("axios");
const router = express.Router();

// 定义统一的输出函数
function output(code, msg, data = []) {
  return {
    code,
    msg,
    data,
  };
}

async function xhs(url) {
  try {
    // 构造请求数据
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };

    // 发送请求获取视频信息
    const response = await axios.get(url, { headers });
    if (!response.data) {
      return output(400, "请求失败");
    }

    // 优化正则表达式
    const pattern =
      /<script>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/is;
    const matches = response.data.match(pattern);

    if (matches) {
      let jsonData = matches[1];
      // 将 undefined 替换为 null
      jsonData = jsonData.replace(/undefined/g, "null");

      // 尝试将匹配到的字符串解析为 JSON
      const decoded = JSON.parse(jsonData);
      if (decoded) {
        const videourl =
          decoded.noteData?.data?.noteData?.video?.media?.stream?.h265?.[0]
            ?.masterUrl;
        if (videourl) {
          const data = {
            author: decoded.noteData?.data?.noteData?.user?.nickName || "",
            authorID: decoded.noteData?.data?.noteData?.user?.userId || "",
            title: decoded.noteData?.data?.noteData?.title || "",
            desc: decoded.noteData?.data?.noteData?.desc || "",
            avatar: decoded.noteData?.data?.noteData?.user?.avatar || "",
            cover: decoded.noteData?.data?.noteData?.imageList?.[0]?.url || "",
            url: videourl,
          };
          return output(200, "解析成功", data);
        } else {
          return output(404, "解析失败，未获取到视频链接");
        }
      } else {
        return output(400, "匹配到的内容不是有效的 JSON 数据");
      }
    } else {
      return output(400, "未找到 JSON 数据");
    }
  } catch (error) {
    console.error("Error:", error);
    return output(500, "服务器错误");
  }
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json(output(201, "url 为空"));
  }

  try {
    const result = await xhs(url);
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json(output(500, "服务器错误"));
  }
});

module.exports = router;
