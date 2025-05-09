export const runtime = "edge";

function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
  };
}

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

async function sendPostRequest(apiurl, payload) {
  try {
    const response = await fetch(apiurl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return {
      code: response.status,
      response: await response.json(),
    };
  } catch (error) {
    console.error("Error making request:", error);
    return {
      code: error.status || 500,
      msg: `请求发生错误: ${error.message}`,
    };
  }
}

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(formatResponse(400, "未提供 url 参数"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  const params = extractParamsFromUrl(url);
  if (!params) {
    return Response.json(formatResponse(400, "提取参数出错"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  try {
    const apiurl = "https://h5.pipigx.com/ppapi/share/fetch_content";
    const payload = {
      pid: parseInt(params.pid),
      mid: parseInt(params.mid),
      type: "post",
    };
    const apiResponse = await sendPostRequest(apiurl, payload);
    const finalResponse = processApiResponse(apiResponse);
    return Response.json(finalResponse, {
      status: finalResponse.code,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    return Response.json(
      { code: 500, msg: `请求发生错误`, error: error },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
