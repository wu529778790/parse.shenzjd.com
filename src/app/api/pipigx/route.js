import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";

export const runtime = "edge";

function extractParamsFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(parsedUrl.search);
    const pid = params.get("pid");
    const mid = params.get("mid");
    if (!pid || !mid) {
      return null;
    }
    return { pid, mid };
  } catch (error) {
    logger.error("Error extracting params:", error.message);
    return null;
  }
}

async function sendPostRequest(apiUrl, payload) {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return {
      code: response.status,
      response: await response.json(),
    };
  } catch (error) {
    logger.error("Error making request:", error.message);
    return null;
  }
}

async function pipigxParse(url) {
  const params = extractParamsFromUrl(url);
  if (!params) {
    return { code: 400, msg: "提取参数出错，请检查链接格式" };
  }

  const apiUrl = "https://h5.pipigx.com/ppapi/share/fetch_content";
  const payload = {
    pid: parseInt(params.pid),
    mid: parseInt(params.mid),
    type: "post",
  };

  const apiResponse = await sendPostRequest(apiUrl, payload);
  
  if (!apiResponse) {
    return { code: 500, msg: "请求上游接口失败" };
  }

  const httpCode = apiResponse.code;
  const response = apiResponse.response;

  if (httpCode >= 400) {
    return { code: httpCode, msg: `HTTP 错误: 状态码 ${httpCode}` };
  }

  if (!response?.data?.post) {
    return { code: 404, msg: "未找到视频数据" };
  }

  const post = response.data.post;
  const videos = post.videos?.filter((v) => Array.isArray(v)) || [];
  
  if (videos.length === 0 || !videos[0]?.url) {
    return { code: 404, msg: "视频地址不存在" };
  }

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: post.content || "无标题",
      cover: `https://file.ippzone.com/img/frame/id/${videos[0].thumb || ""}`,
      video: videos[0].url,
    },
  };
}

export const GET = createApiHandler(pipigxParse);
