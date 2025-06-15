export const runtime = "edge";

function output(code, msg, data = []) {
  return {
    code,
    msg,
    data,
  };
}

// 获取重定向后的真实URL
async function getRealUrl(url) {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };

    // 如果是短链接，需要跟随重定向
    if (url.includes("xhslink.com")) {
      const response = await fetch(url, {
        headers,
        redirect: "manual", // 手动处理重定向
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          return location;
        }
      }

      // 如果没有重定向，尝试直接获取页面内容查找真实链接
      const response2 = await fetch(url, { headers });
      const html = await response2.text();

      // 查找页面中的重定向链接
      const redirectMatch = html.match(
        /window\.location\.href\s*=\s*['"]([^'"]*)['"]/
      );
      if (redirectMatch) {
        return redirectMatch[1];
      }

      // 查找meta refresh重定向
      const metaMatch = html.match(
        /<meta[^>]*http-equiv\s*=\s*['"]refresh['"][^>]*content\s*=\s*['"][^;]*;\s*url\s*=\s*([^'"]*)['"]/i
      );
      if (metaMatch) {
        return metaMatch[1];
      }
    }

    return url;
  } catch {
    return url;
  }
}

// 安全地获取嵌套属性
function safeGet(obj, path) {
  try {
    return path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return current[key];
      }
      return null;
    }, obj);
  } catch {
    return null;
  }
}

async function xhs(url) {
  try {
    // 先获取真实URL
    const realUrl = await getRealUrl(url);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };

    const response = await fetch(realUrl, { headers });
    const html = await response.text();

    if (!html) {
      return output(400, "请求失败");
    }

    const pattern =
      /<script>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/is;
    const matches = html.match(pattern);

    if (!matches) {
      return output(400, "未找到页面数据");
    }

    let jsonData = matches[1];
    jsonData = jsonData.replace(/undefined/g, "null");

    let decoded;
    try {
      decoded = JSON.parse(jsonData);
    } catch {
      return output(400, "JSON数据解析失败");
    }

    if (!decoded || typeof decoded !== "object") {
      return output(400, "数据格式错误");
    }

    // 尝试不同的数据结构路径
    let noteData =
      safeGet(decoded, "noteData.data.noteData") ||
      safeGet(decoded, "note.data") ||
      safeGet(decoded, "noteDetail.data") ||
      safeGet(decoded, "data.noteData");

    if (!noteData || typeof noteData !== "object") {
      return output(400, "数据结构不匹配，请检查链接是否为有效的小红书内容");
    }

    // 安全地构建基础数据
    const data = {
      author:
        safeGet(noteData, "user.nickName") ||
        safeGet(noteData, "user.name") ||
        "",
      authorID:
        safeGet(noteData, "user.userId") || safeGet(noteData, "user.id") || "",
      title: noteData.title || "",
      desc: noteData.desc || noteData.description || "",
      avatar:
        safeGet(noteData, "user.avatar") ||
        safeGet(noteData, "user.avatarUrl") ||
        "",
    };

    // 检查视频URL
    let videoUrl = null;
    const videoStream = safeGet(noteData, "video.media.stream");

    if (videoStream && typeof videoStream === "object") {
      // 尝试h265格式
      const h265List = videoStream.h265;
      if (Array.isArray(h265List) && h265List.length > 0 && h265List[0]) {
        videoUrl = h265List[0].masterUrl;
      }

      // 如果没有h265，尝试h264
      if (!videoUrl) {
        const h264List = videoStream.h264;
        if (Array.isArray(h264List) && h264List.length > 0 && h264List[0]) {
          videoUrl = h264List[0].masterUrl;
        }
      }
    }

    if (videoUrl) {
      // 视频内容
      data.cover = "";
      const imageList = noteData.imageList;
      if (Array.isArray(imageList) && imageList.length > 0 && imageList[0]) {
        data.cover =
          imageList[0].url || safeGet(imageList[0], "infoList.0.url") || "";
      }
      data.url = videoUrl;
      data.type = "video";
      return output(200, "解析成功", data);
    }

    // 检查图片内容
    const imageList = noteData.imageList;
    if (Array.isArray(imageList) && imageList.length > 0) {
      const images = [];
      let cover = "";

      for (let i = 0; i < imageList.length; i++) {
        const img = imageList[i];
        if (img && typeof img === "object") {
          let imageUrl = img.url || safeGet(img, "infoList.0.url");
          if (imageUrl) {
            images.push(imageUrl);
            if (i === 0) cover = imageUrl;
          }
        }
      }

      if (images.length > 0) {
        data.cover = cover;
        data.images = images;
        data.type = "image";
        return output(200, "解析成功", data);
      }
    }

    return output(404, "该内容不包含视频或图片");
  } catch (error) {
    return output(500, `服务器错误：${error.message || "未知错误"}`);
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
  } catch (error) {
    return Response.json(output(500, "服务器错误", error.message), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
