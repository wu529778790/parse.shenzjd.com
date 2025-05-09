export const runtime = "edge";

const TIMEOUT = 5000;

async function getRedirectUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return response.url;
  } catch (error) {
    throw new Error(`Error getting redirect URL: ${error.message}`);
  }
}

async function pipixia(url) {
  try {
    const redirectUrl = await getRedirectUrl(url);
    const idMatch = redirectUrl.match(/item\/(.*)\?/);
    if (!idMatch || !idMatch[1]) {
      return { code: 404, msg: "无法从 URL 中提取视频 ID" };
    }
    const apiUrl = `https://h5.pipix.com/bds/cell/cell_h5_comment/?count=5&aid=1319&app_name=super&cell_id=${idMatch[1]}`;
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const data = await response.json();
    if (!data || !data.data?.cell_comments?.[1]?.comment_info?.item) {
      return { code: 404, msg: "解析失败，未找到所需数据" };
    }
    const item = data.data.cell_comments[1].comment_info.item;
    const videoUrl = item.video.video_high.url_list[0].url;
    return {
      code: 200,
      msg: "解析成功",
      data: {
        author: item.author.name,
        avatar: item.author.avatar.download_list[0].url,
        title: item.content,
        cover: item.cover.download_list[0].url,
        url: videoUrl,
      },
    };
  } catch {
    return { code: 404, msg: `解析过程中出现错误` };
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
    const result = await pipixia(url);
    return Response.json(result, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    return Response.json(
      { code: 500, msg: "服务器错误", error: error },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
