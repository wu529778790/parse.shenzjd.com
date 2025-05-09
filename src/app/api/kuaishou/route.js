export const runtime = "edge";
import axios from "axios";

function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
  };
}

async function kuaishou(url) {
  try {
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
        /window\.__APOLLO_STATE__\s*=\s*(.*?)<\/script>/s;
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
  } catch {
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
  } catch {
    return url;
  }
}

async function makeRequest(url, headers) {
  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(formatResponse(201, "链接不能为空！"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  try {
    const jsonData = await kuaishou(url);
    if (jsonData) {
      return Response.json(jsonData, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      return Response.json(formatResponse(404, "链接错误"), {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  } catch (error) {
    return Response.json(formatResponse(500, "服务器错误", error), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
