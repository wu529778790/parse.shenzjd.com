const express = require("express");
const axios = require("axios");
const router = express.Router();

/**
 * 格式化响应信息
 */
function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
  };
}

/**
 * 从 URL 中提取 pid 和 mid 参数
 */
function extractParamsFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    const pid = params.get("pid");
    const mid = params.get("mid");

    if (!pid || !mid) {
      return false;
    }

    return { pid, mid };
  } catch (error) {
    console.error("Error extracting params:", error);
    return false;
  }
}

/**
 * 发送 POST 请求到指定 API
 */
async function sendPostRequest(apiurl, payload) {
  try {
    const response = await axios.post(apiurl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    return {
      code: response.status,
      response: response.data,
    };
  } catch (error) {
    console.error("Error making request:", error);
    return {
      code: error.response?.status || 500,
      msg: `请求发生错误: ${error.message}`,
    };
  }
}

/**
 * 处理 API 响应
 */
function processApiResponse(apiResponse) {
  const httpCode = apiResponse.code;
  const response = apiResponse.response;

  if (httpCode >= 400) {
    return formatResponse(httpCode, `HTTP 错误发生: HTTP 状态码 ${httpCode}`);
  }

  if (!response || !response.data || !response.data.post) {
    return formatResponse(500, "响应中缺少 data.post 字段");
  }

  const json = response.data.post;
  const videoData = [];

  if (json.videos && Array.isArray(json.videos)) {
    videoData.push(...json.videos.filter((video) => Array.isArray(video)));
  }

  const arr = {
    title: json.content,
    cover: `https://file.ippzone.com/img/frame/id/${videoData[0]?.thumb || ""}`,
    video: videoData[0]?.url,
  };

  return formatResponse(200, "解析成功", arr);
}

// API 路由
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json(formatResponse(400, "未提供 url 参数"));
  }

  // 提取参数
  const params = extractParamsFromUrl(url);
  if (!params) {
    return res.status(400).json(formatResponse(400, "提取参数出错"));
  }

  try {
    // 构建请求体数据
    const apiurl = "https://h5.pipigx.com/ppapi/share/fetch_content";
    const payload = {
      pid: parseInt(params.pid),
      mid: parseInt(params.mid),
      type: "post",
    };

    // 发送请求
    const apiResponse = await sendPostRequest(apiurl, payload);
    const finalResponse = processApiResponse(apiResponse);

    res.status(finalResponse.code).json(finalResponse);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json(formatResponse(500, "服务器错误"));
  }
});

module.exports = router;
