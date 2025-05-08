const express = require("express");
const axios = require("axios");
const router = express.Router();

async function weibo(url) {
  try {
    let id;
    if (url.includes("show?fid=")) {
      const match = url.match(/fid=(.*)/);
      id = match[1];
    } else {
      const match = url.match(/\d+\:\d+/);
      id = match[0];
    }

    const response = await weiboRequest(id);
    if (response) {
      const data = response.data.Component_Play_Playinfo;
      const videoUrl = Object.values(data.urls)[0];

      return {
        code: 200,
        msg: "解析成功",
        data: {
          author: data.author,
          avatar: data.avatar,
          time: data.real_date,
          title: data.title,
          cover: data.cover_image,
          url: videoUrl,
        },
      };
    }
    return null;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function weiboRequest(id) {
  try {
    const cookie = process.env.WEIBO_COOKIE || ""; // 从环境变量获取cookie
    const postData = `data={"Component_Play_Playinfo":{"oid":"${id}"}}`;

    const response = await axios.post(
      `https://weibo.com/tv/api/component?page=/tv/show/${id}`,
      postData,
      {
        headers: {
          Cookie: cookie,
          Referer: `https://weibo.com/tv/show/${id}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error making weibo request:", error);
    return null;
  }
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({
      code: 201,
      msg: "链接不能为空！",
    });
  }

  try {
    const info = await weibo(url);
    if (info && info.code === 200) {
      res.json(info);
    } else {
      res.status(404).json({
        code: 404,
        msg: "解析失败！",
      });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      code: 500,
      msg: "服务器错误",
    });
  }
});

module.exports = router;
