export const runtime = "edge";

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
  } catch {
    return null;
  }
}

async function weiboRequest(id) {
  try {
    const cookie = process.env.WEIBO_COOKIE || "";
    const postData = `data={\"Component_Play_Playinfo\":{\"oid\":\"${id}\"}}`;
    const response = await fetch(
      `https://weibo.com/tv/api/component?page=/tv/show/${id}`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Referer: `https://weibo.com/tv/show/${id}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: postData,
        signal: AbortSignal.timeout(5000),
      }
    );
    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { code: 201, msg: "链接不能为空！" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
  try {
    const info = await weibo(url);
    if (info && info.code === 200) {
      return Response.json(info, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      return Response.json(
        { code: 404, msg: "解析失败！" },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
  } catch (error) {
    return Response.json(
      { code: 500, msg: "服务器错误", error: error },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
