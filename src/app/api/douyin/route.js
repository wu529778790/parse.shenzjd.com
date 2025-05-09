import axios from "axios";

async function douyin(url) {
  // ... 保留原有 douyin 解析逻辑 ...
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0",
    };
    let id = await extractId(url);
    if (!id) {
      const response = await axios.get(url, { headers });
      const redirectUrl = getRedirectUrl(response.data);
      if (redirectUrl) {
        id = await extractId(redirectUrl);
      }
    }
    if (!id) {
      return { code: 400, msg: "无法解析视频 ID" };
    }
    const response = await axios.get(
      `https://www.iesdouyin.com/share/video/${id}`,
      { headers }
    );
    const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s;
    const matches = response.data.match(pattern);
    if (!matches || !matches[1]) {
      return { code: 201, msg: "解析失败" };
    }
    const videoInfo = JSON.parse(matches[1].trim());
    if (!videoInfo.loaderData) {
      return { code: 201, msg: "解析失败" };
    }
    const videoResUrl = videoInfo.loaderData[
      "video_(id)/page"
    ].videoInfoRes.item_list[0].video.play_addr.url_list[0].replace(
      "playwm",
      "play"
    );
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
  } catch {
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { code: 201, msg: "url为空" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
  try {
    const response = await douyin(url);
    if (!response) {
      return Response.json(
        { code: 404, msg: "获取失败" },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
    return Response.json(response, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return Response.json(
      { code: 500, msg: "服务器错误" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
