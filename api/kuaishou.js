const express = require("express");
const axios = require("axios");
const router = express.Router();

// 格式化响应数据的函数
function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
  };
}

async function kuaishou(url) {
  try {
    // 定义请求头
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0",
    };

    const newurl = await getRedirectedUrl(url);
    let response = "";
    const shortVideoPattern = /short-video\/([^?]+)/;
    const photoPattern = /photo\/([^?]+)/;

    let id;
    if (shortVideoPattern.test(newurl)) {
      id = newurl.match(shortVideoPattern)[1];
      response = await makeRequest(url, headers);
    } else if (photoPattern.test(newurl)) {
      id = newurl.match(photoPattern)[1];
      response = await makeRequest(
        `https://www.kuaishou.com/short-video/${id}`,
        headers
      );
    }

    if (response) {
      const apolloStatePattern =
        /window\.__APOLLO_STATE__\s*=\s*(.*?)\<\/script>/s;
      const matches = response.match(apolloStatePattern);

      if (matches) {
        let cleanedApolloState = matches[1]
          .replace(/function\s*\([^)]*\)\s*{[^}]*}/g, ":")
          .replace(/,\s*(?=}|])/g, "")
          .replace(/;(:());/g, "");

        const videoInfo = JSON.parse(cleanedApolloState)["defaultClient"];
        if (videoInfo) {
          const key = `VisionVideoDetailPhoto:${id}`;
          const json = videoInfo[key];
          if (json) {
            return formatResponse(200, "解析成功", {
              title: json.caption,
              cover: json.coverUrl,
              url: json.photoUrl,
            });
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function getRedirectedUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
    });
    return response.request.res.responseUrl || url;
  } catch (error) {
    console.error("Error getting redirected URL:", error);
    return url;
  }
}

async function makeRequest(url, headers) {
  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error("Error making request:", error);
    return null;
  }
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json(formatResponse(201, "链接不能为空！"));
  }

  try {
    const jsonData = await kuaishou(url);
    if (jsonData) {
      res.json(jsonData);
    } else {
      res.status(404).json(formatResponse(404, "链接错误"));
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json(formatResponse(500, "服务器错误"));
  }
});

module.exports = router;
