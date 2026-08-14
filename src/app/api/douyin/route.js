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
    const { id, type: contentType, redirectUrl, ttwid } = extractResult;
    const sharePath = contentType === "note" ? "note" : "video";

    // ---- ID 合法性预校验 ----
    // 抖音标准 aweme_id 为 19 位数字（首位通常为 7）。17-19 位视为合法
    // （兼容历史/note/story 类型）；明显非法的伪 ID（如日志中出现的
    // 000000000503073 这类 15 位）直接返回，不发请求，节省服务器流量。
    if (!/^\d{17,19}$/.test(id)) {
      logger.warn(`Douyin invalid video id format: ${id}`);
      return {
        code: 400,
        msg: "解析失败：链接中的视频 ID 格式不正确，请确认链接来自抖音分享",
      };
    }

    // ---- Step 2: 从分享页获取 SSR 数据 ----
    // 优先使用完整重定向 URL（含 share_version / share_sign 等参数）以降低被过滤概率
    let shareUrl = redirectUrl || `https://www.iesdouyin.com/share/${sharePath}/${id}`;
    // 如果 redirectUrl 是 douyin.com 域名，替换为 iesdouyin.com
    if (shareUrl.includes("www.douyin.com")) {
      const params = shareUrl.includes("?") ? shareUrl.split("?")[1] : "";
      shareUrl = `https://www.iesdouyin.com/share/${sharePath}/${id}${params ? "?" + params : ""}`;
    }

    // 抖音二次握手机制：匿名首次访问只下发 ttwid cookie（无需登录），
    // 带 ttwid 的第二次请求才会返回视频数据。维护一个极简 cookie jar。
    let ttwidCookie = ttwid || "";
    const buildFetchHeaders = () => {
      const headers = { ...MOBILE_HEADERS };
      const cookies = [];
      if (ttwidCookie && !DOUYIN_COOKIE.includes("ttwid=")) {
        cookies.push(ttwidCookie);
      }
      if (DOUYIN_COOKIE) {
        cookies.push(DOUYIN_COOKIE);
      }
      if (cookies.length > 0) {
        headers.Cookie = cookies.join("; ");
      }
      return headers;
    };

    // 尝试多个域名 / 路径以应对机房 IP 被反爬的情况
    const tryUrls = [
      shareUrl,
      `https://www.iesdouyin.com/share/${sharePath}/${id}`,
      `https://m.douyin.com/share/${sharePath}/${id}`,
      `https://www.douyin.com/video/${id}`,
    ];

    let videoInfo = null;
    let lastHtml = "";

    // 判断 _ROUTER_DATA 是否包含有效视频数据
    // 抖音二次握手下，首次请求只下发 ttwid cookie、数据为空壳，需带 cookie 重试
    const hasValidData = (info) => {
      if (!info?.loaderData) return false;
      const keys = ["video_(id)/page", "note_(id)/page", "story_(id)/page"];
      return keys.some(
        (k) => info.loaderData[k]?.videoInfoRes?.item_list?.length > 0
      );
    };

    // 最多两轮：第一轮拿 ttwid（可能无数据），第二轮带 ttwid 拿数据
    for (let round = 0; round < 2 && !videoInfo; round++) {
      for (const fetchUrl of tryUrls) {
        if (videoInfo) break;
        try {
          const response = await fetch(fetchUrl, { headers: buildFetchHeaders() });
          const html = await response.text();
          lastHtml = html;

          // 从响应头收集 ttwid，供后续请求使用
          const newTtwid = extractTtwid(response);
          if (newTtwid) {
            if (ttwidCookie !== newTtwid) {
              ttwidCookie = newTtwid;
              logger.log(`Got ttwid from: ${fetchUrl}`);
            }
          }

          // 检查是否被重定向到国际版
          if (html.includes("tiktok.com") || html.includes("访问受限")) {
            logger.warn(`Douyin redirected to tiktok for URL: ${fetchUrl}`);
            continue;
          }

          const routerMatch = html.match(
            /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s
          );
          if (routerMatch && routerMatch[1]) {
            const parsed = JSON.parse(routerMatch[1].trim());
            if (hasValidData(parsed)) {
              videoInfo = parsed;
              logger.log(
                `Got valid _ROUTER_DATA from: ${fetchUrl} (round ${round + 1})`
              );
              break;
            }
            logger.log(
              `Got empty _ROUTER_DATA shell from: ${fetchUrl}, retrying with cookie...`
            );
          }
        } catch (e) {
          logger.warn(`Failed to fetch ${fetchUrl}: ${e.message}`);
        }
      }
      if (!videoInfo && ttwidCookie && round === 0) {
        logger.log("Round 1 got ttwid, retrying with cookie...");
      }
    }

    if (!videoInfo) {
      // 记录部分响应内容用于诊断（截取前 500 字符）
      const snippet = lastHtml.replace(/\s+/g, " ").slice(0, 500);
      logger.warn(
        `No _ROUTER_DATA found for video ${id}. Response snippet: ${snippet}`
      );
      // 已自动携带匿名 ttwid 仍拿不到数据：多为视频不存在 / 已删除 / 被过滤
      return {
        code: 201,
        msg: "解析失败：未能从页面获取视频数据，可能是视频不存在、已删除或页面结构变化",
      };
    }

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
    return { code: 500, msg: "服务器内部错误" };
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
    // aweme_type: 0=普通视频, 1=图文, 2=图文(实况图/动图), 4=故事
    // 同时检查 video.duration > 0 排除只有音乐占位的情况
    const awemeType = videoData.aweme_type;
    const hasRealVideo =
      !!videoData.video?.play_addr?.url_list?.[0] &&
      (videoData.video.duration || 0) > 0;
    const isImageType = awemeType === 1 || awemeType === 2;
    const isVideo = !isImageType && hasRealVideo;
    const images =
      Array.isArray(videoData.images)
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
        // 视频时长（毫秒），前端据此判断长视频不走代理、引导新窗口播放
        duration: videoData.video?.duration || 0,
        music: {
          author: videoData.music?.author || "未知音乐作者",
          avatar: videoData.music?.cover_large?.url_list?.[0] || "",
        },
      },
    };
  } catch (error) {
    logger.error("Error parsing video data:", error);
    return { code: 500, msg: "服务器内部错误" };
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

    // 从响应头收集匿名 ttwid（首次访问抖音会自动下发，无需登录）
    const ttwid = extractTtwid(response);

    // 从最终 URL 中提取 ID
    const result = extractIdFromUrl(finalUrl);
    if (result) return { ...result, redirectUrl: finalUrl, ttwid };

    // 如果 URL 中找不到，尝试从 HTML 中找
    const html = await response.text();
    const videoCanonical = html.match(
      /href="https:\/\/www\.iesdouyin\.com\/share\/video\/(\d+)/
    );
    if (videoCanonical) {
      return { id: videoCanonical[1], type: "video", redirectUrl: finalUrl, ttwid };
    }
    const noteCanonical = html.match(
      /href="https:\/\/www\.iesdouyin\.com\/share\/note\/(\d+)/
    );
    if (noteCanonical) {
      return { id: noteCanonical[1], type: "note", redirectUrl: finalUrl, ttwid };
    }

    // 尝试从 canonical 中提取
    const canonical = html.match(
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/
    );
    if (canonical) {
      const canonicalResult = extractIdFromUrl(canonical[1]);
      if (canonicalResult) {
        return { ...canonicalResult, redirectUrl: canonical[1], ttwid };
      }
    }

    return null;
  } catch (error) {
    logger.error("Error extracting ID:", error);
    return null;
  }
}

/**
 * 从响应头 Set-Cookie 中提取指定名称的 cookie（兼容 undici 的多 Set-Cookie 头）
 */
function extractTtwid(response) {
  try {
    const setCookies = [];
    if (typeof response.headers.getSetCookie === "function") {
      setCookies.push(...response.headers.getSetCookie());
    } else {
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === "set-cookie") setCookies.push(value);
      }
    }
    for (const sc of setCookies) {
      const match = sc.match(/ttwid=([^;]+)/);
      if (match) return `ttwid=${match[1]}`;
    }
  } catch (e) {
    logger.warn(`Failed to extract ttwid: ${e.message}`);
  }
  return "";
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
