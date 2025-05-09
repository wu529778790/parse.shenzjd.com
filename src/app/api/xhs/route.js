export const runtime = "edge";
import axios from "axios";

function output(code, msg, data = []) {
  return {
    code,
    msg,
    data,
  };
}

async function xhs(url) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };
    const response = await axios.get(url, { headers });
    if (!response.data) {
      return output(400, "请求失败");
    }
    const pattern =
      /<script>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/is;
    const matches = response.data.match(pattern);
    if (matches) {
      let jsonData = matches[1];
      jsonData = jsonData.replace(/undefined/g, "null");
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
  } catch {
    return output(500, "服务器错误");
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(output(201, "url 为空"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  try {
    const result = await xhs(url);
    return Response.json(result, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return Response.json(output(500, "服务器错误"), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
