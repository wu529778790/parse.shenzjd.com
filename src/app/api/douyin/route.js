import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";

// Docker 自托管下 Node runtime 对外网 fetch 通常比 Edge 沙箱更稳定（抖音等站）
export const runtime = "nodejs";

// 最小化请求头 — 过多的 sec-ch-ua / desktop 头与 mobile UA 混用会触发抖音反爬
const MOBILE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

async function douyin(url) {
  try {
    const DOUYIN_COOKIE = process.env.DOUYIN_COOKIE || "";

    // ---- Step 1: 从短链 / 分享链接中提取视频 ID 和完整重定向 URL ----
    const extractResult = await extractIdAndRedirectUrl(url);
    if (!extractResult) {
      return {
        code: 400,
        msg: "无法解析视频 ID：请确保链接格式正确且视频可访问",
      };
    }
    const { id, type: contentType, redirectUrl } = extractResult;
    const sharePath = contentType === "note" ? "note" : "video";

    // ---- Step 2: 从 iesdouyin.com 分享页获取 SSR 数据 ----
    // 优先使用完整重定向 URL（含 share_version / share_sign 等参数）以降低被过滤概率
    let shareUrl = redirectUrl || `https://www.iesdouyin.com/share/${sharePath}/${id}`;
    // 如果 redirectUrl 是 douyin.com 域名，替换为 iesdouyin.com
    if (shareUrl.includes("www.douyin.com")) {
      const params = shareUrl.includes("?") ? shareUrl.split("?")[1] : "";
      shareUrl = `https://www.iesdouyin.com/share/${sharePath}/${id}${params ? "?" + params : ""}`;
    }

    const fetchHeaders = { ...MOBILE_HEADERS };
    if (DOUYIN_COOKIE) {
      fetchHeaders.Cookie = DOUYIN_COOKIE;
    }

    const response = await fetch(shareUrl, { headers: fetchHeaders });
    const html = await response.text();

    // 检查是否被重定向到国际版
    if (html.includes("tiktok.com") || html.includes("访问受限")) {
      return {
        code: 403,
        msg: "解析失败：当前服务器IP无法访问抖音，请使用代理服务器或更换部署区域",
      };
    }

    const routerMatch = html.match(
      /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s
    );
    if (!routerMatch || !routerMatch[1]) {
      logger.warn("No _ROUTER_DATA found in Douyin share page");
      return {
        code: 201,
        msg: "解析失败：未能从页面获取视频数据，可能是页面结构变化、接口受限或视频已被删除",
      };
    }

    const videoInfo = JSON.parse(routerMatch[1].trim());

    if (!videoInfo.loaderData) {
      return {
        code: 201,
        msg: "解析失败：视频数据结构异常，可能是抖音接口发生变化",
      };
    }

    // ---- Step 3: 提取视频 / 图文数据 ----
    const parseResult = parseVideoData(videoInfo);
    if (parseResult) return parseResult;

    // ---- Step 4: 分享页数据为空 — 提取 filter_list 给出明确错误 ----
    const filterReason = extractFilterReason(videoInfo);
    if (filterReason) {
      logger.warn(`Douyin share page filtered video ${id}: ${filterReason}`);
      return {
        code: 201,
        msg: `解析失败：抖音服务端过滤了该内容（${filterReason}），部分视频（如实况图、刚发布的内容）暂不支持解析`,
      };
    }

    return {
      code: 201,
      msg: "解析失败：未能从页面获取视频数据，可能是页面结构变化、接口受限或视频已被删除",
    };
  } catch (error) {
    logger.error("Error in douyin function:", error);
    return { code: 500, msg: `服务器错误：${error.message || "未知错误"}` };
  }
}

/**
 * 从 loaderData 中提取视频 / 图文数据，返回标准化结果或 null
 */
function parseVideoData(videoInfo) {
  try {
    // 兼容多种 loaderData key（video / note / story）
    const loaderKeys = [
      "video_(id)/page",
      "note_(id)/page",
      "story_(id)/page",
    ];
    let videoData = null;
    for (const key of loaderKeys) {
      const item = videoInfo.loaderData[key]?.videoInfoRes?.item_list?.[0];
      if (item) {
        videoData = item;
        break;
      }
    }
    if (!videoData) return null;

    if (!videoData.author) {
      return {
        code: 201,
        msg: "解析失败：视频作者信息缺失",
      };
    }

    // 判断是视频还是图文内容
    const isVideo = !!videoData.video?.play_addr?.url_list?.[0];
    const images =
      !isVideo && Array.isArray(videoData.images)
        ? videoData.images.map((img) => img.url_list?.[0]).filter(Boolean)
        : [];

    if (!isVideo && images.length === 0) {
      return {
        code: 201,
        msg: "解析失败：未找到可解析的视频或图片内容",
      };
    }

    const videoResUrl = isVideo
      ? videoData.video.play_addr.url_list[0].replace("playwm", "play")
      : "";

    return {
      code: 200,
      msg: "解析成功",
      data: {
        author: videoData.author.nickname || "未知作者",
        uid: videoData.author.unique_id || "",
        avatar: videoData.author.avatar_medium?.url_list?.[0] || "",
        like: videoData.statistics?.digg_count || 0,
        time: videoData.create_time || 0,
        title: videoData.desc || "无标题",
        cover: isVideo
          ? videoData.video.cover?.url_list?.[0] || ""
          : images[0] || "",
        type: isVideo ? "video" : "image",
        url: videoResUrl || undefined,
        images: images.length > 0 ? images : undefined,
        music: {
          author: videoData.music?.author || "未知音乐作者",
          avatar: videoData.music?.cover_large?.url_list?.[0] || "",
        },
      },
    };
  } catch (error) {
    logger.error("Error parsing video data:", error);
    return { code: 500, msg: `服务器错误：${error.message || "未知错误"}` };
  }
}

/**
 * 从 loaderData 中提取 filter_list 的过滤原因
 */
function extractFilterReason(videoInfo) {
  for (const val of Object.values(videoInfo.loaderData || {})) {
    if (val && typeof val === "object") {
      const filterList = val.videoInfoRes?.filter_list;
      if (Array.isArray(filterList) && filterList.length > 0) {
        return filterList.map((f) => f.filter_reason).join("; ");
      }
    }
  }
  return null;
}

/**
 * 从 URL 中提取视频 ID 和完整重定向 URL
 * 返回 { id, type, redirectUrl } 或 null
 */
async function extractIdAndRedirectUrl(url) {
  try {
    const response = await fetch(url, {
      headers: MOBILE_HEADERS,
      redirect: "follow",
    });
    const finalUrl = response.url || url;

    // 从最终 URL 中提取 ID
    const result = extractIdFromUrl(finalUrl);
    if (result) return { ...result, redirectUrl: finalUrl };

    // 如果 URL 中找不到，尝试从 HTML 中找
    const html = await response.text();
    const videoCanonical = html.match(
      /href="https:\/\/www\.iesdouyin\.com\/share\/video\/(\d+)/
    );
    if (videoCanonical) {
      return { id: videoCanonical[1], type: "video", redirectUrl: finalUrl };
    }
    const noteCanonical = html.match(
      /href="https:\/\/www\.iesdouyin\.com\/share\/note\/(\d+)/
    );
    if (noteCanonical) {
      return { id: noteCanonical[1], type: "note", redirectUrl: finalUrl };
    }

    // 尝试从 canonical 中提取
    const canonical = html.match(
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/
    );
    if (canonical) {
      const canonicalResult = extractIdFromUrl(canonical[1]);
      if (canonicalResult) {
        return { ...canonicalResult, redirectUrl: canonical[1] };
      }
    }

    return null;
  } catch (error) {
    logger.error("Error extracting ID:", error);
    return null;
  }
}

/**
 * 从 URL 中提取视频 ID 和类型
 */
function extractIdFromUrl(urlStr) {
  let match = urlStr.match(/video\/(\d+)/);
  if (match) return { id: match[1], type: "video" };
  match = urlStr.match(/note\/(\d+)/);
  if (match) return { id: match[1], type: "note" };
  match = urlStr.match(/story\/(\d+)/);
  if (match) return { id: match[1], type: "story" };
  // 兜底：找长数字串
  match = urlStr.match(/(\d{15,})/);
  if (match) return { id: match[1], type: "video" };
  return null;
}

export const GET = createApiHandler(douyin);
