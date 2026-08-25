import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";

export const runtime = "nodejs";

async function parseVideoId(videoId) {
  const reqUrl = `https://v2.doupai.cc/topic/${videoId}.json`;
  // 网络异常/超时兜底：重试 1 次，避免偶发出网抖动直接 500
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(reqUrl, {
        headers: { "User-Agent": DEFAULT_MOBILE_UA },
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json();
      const data = json?.data;
      if (!data?.videoUrl) {
        return { code: 404, msg: "逗拍解析失败" };
      }
      return {
        code: 200,
        msg: "解析成功",
        data: {
          title: data.name || "",
          author: data.userId?.name || "",
          avatar: data.userId?.avatar || "",
          uid: String(data.userId?.id || ""),
          cover: data.imageUrl || "",
          url: data.videoUrl,
        },
      };
    } catch (error) {
      if (attempt === 2) {
        return { code: 500, msg: `逗拍接口请求失败（${error.message}）` };
      }
    }
  }
  return { code: 500, msg: "逗拍解析失败" };
}

async function doupaiParse(shareUrl) {
  let id = "";
  try {
    const parsed = new URL(shareUrl);
    // 支持两种分享形态：
    //   d.doupai.cc/share?id=xxxx                    —— query 参数
    //   d.doupai.cc/topic/xxxx.html（或 /topic/xxxx）—— 路径型
    id = parsed.searchParams.get("id") || "";
    if (!id) {
      const pathMatch = parsed.pathname.match(/\/topic\/([A-Za-z0-9]+)/);
      if (pathMatch) id = pathMatch[1];
    }
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!id) {
    return { code: 400, msg: "无法解析逗拍 id" };
  }
  return parseVideoId(id);
}

export const GET = createApiHandler(doupaiParse);
