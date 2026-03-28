import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";

export const runtime = "edge";

const TIMEOUT = 8000;

async function getRedirectUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return response.url;
  } catch (error) {
    logger.error("Error getting redirect URL:", error.message);
    throw new Error("获取重定向URL失败");
  }
}

async function ppxiaParse(url) {
  try {
    const redirectUrl = await getRedirectUrl(url);
    const idMatch = redirectUrl.match(/item\/([^?&]+)/);
    
    if (!idMatch?.[1]) {
      return { code: 400, msg: "无法从 URL 中提取视频 ID" };
    }

    const apiUrl = `https://h5.pipix.com/bds/cell/cell_h5_comment/?count=5&aid=1319&app_name=super&cell_id=${idMatch[1]}`;
    
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
      return { code: response.status, msg: "上游接口请求失败" };
    }

    const data = await response.json();
    
    // 尝试从多个位置获取视频数据
    const item = data?.data?.cell_comments?.[1]?.comment_info?.item ||
                 data?.data?.cell_comments?.[0]?.comment_info?.item;

    if (!item?.video?.video_high?.url_list?.[0]?.url) {
      return { code: 404, msg: "未找到视频数据" };
    }

    return {
      code: 200,
      msg: "解析成功",
      data: {
        author: item.author?.name || "未知作者",
        avatar: item.author?.avatar?.download_list?.[0]?.url || "",
        title: item.content || "无标题",
        cover: item.cover?.download_list?.[0]?.url || "",
        url: item.video.video_high.url_list[0].url,
      },
    };
  } catch (error) {
    logger.error("ppxia parse error:", error.message);
    return { code: 500, msg: "解析失败：" + error.message };
  }
}

export const GET = createApiHandler(ppxiaParse);
