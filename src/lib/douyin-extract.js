/**
 * 抖音解析的「提取层」纯函数 —— 输入 HTML / 页面数据，输出结构化结果。
 *
 * 与网络无关，可离线测试：配合 tests/snapshots/ 下的页面快照做回归，
 * 平台改版时替换快照即可定位提取逻辑失效点（参考 README 测试章节）。
 * 网络请求、重定向、ttwid 握手等逻辑保留在 app/api/douyin/route.js。
 */

import { logger } from "@/lib/api-utils";

/**
 * 判断 loaderData 是否包含有效视频数据
 * 抖音二次握手下，首次请求只下发 ttwid cookie、数据为空壳，需带 cookie 重试
 */
export function hasValidData(info) {
  if (!info?.loaderData) return false;
  const keys = ["video_(id)/page", "note_(id)/page", "story_(id)/page"];
  return keys.some(
    (k) => info.loaderData[k]?.videoInfoRes?.item_list?.length > 0
  );
}

/**
 * 尝试从分享页 HTML 中解析内嵌的 JSON 数据块（参考 video-unwatermark sharepage.py）
 * 依次支持：_ROUTER_DATA（当前主格式）→ RENDER_DATA（URL 编码）→ _SSR_DATA。
 * 解析成功返回对象，否则返回 null。注意：即使页面带 argus 风控脚本，
 * 只要含有效数据块也会被解析出来（先数据后反爬）。
 */
export function tryParseEmbedded(html) {
  const router = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s);
  if (router && router[1]) {
    try {
      return JSON.parse(router[1].trim());
    } catch {
      /* 尝试下一种格式 */
    }
  }
  const render = html.match(
    /<script[^>]+id=["']RENDER_DATA["'][^>]*>(.*?)<\/script>/s
  );
  if (render && render[1]) {
    try {
      return JSON.parse(decodeURIComponent(render[1].trim()));
    } catch {
      /* 尝试下一种格式 */
    }
  }
  const ssr = html.match(
    /window\._SSR_(?:HYDRATED_)?DATA\s*=\s*(.*?)<\/script>/s
  );
  if (ssr && ssr[1]) {
    try {
      return JSON.parse(ssr[1].trim());
    } catch {
      /* 无可用数据 */
    }
  }
  return null;
}

/**
 * 从 loaderData 中提取视频 / 图文数据，返回标准化结果或 null
 */
export function parseVideoData(videoInfo) {
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
    // 同时检查 video.duration > 0 排除只有音乐占位的情况；
    // 若只有 uri（video_id）无 url_list，也视为可播放（走 uri 兜底直链）
    const playAddr = videoData.video?.play_addr || {};
    const hasUri = !!playAddr.uri && !String(playAddr.uri).startsWith("http");
    const awemeType = videoData.aweme_type;
    const hasRealVideo =
      (!!playAddr.url_list?.[0] || hasUri) &&
      ((videoData.video.duration || 0) > 0 || hasUri);
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

    const play = videoData.video?.play_addr || {};
    const urlList = Array.isArray(play.url_list) ? play.url_list : [];
    let videoResUrl = urlList[0]
      ? urlList[0].replace("playwm", "play").replace("play_wm", "play")
      : "";

    // uri 兜底直链（参考 video-unwatermark sharepage.py）：
    // 分享页未内嵌 url_list 但只要拿到 video_id（uri），即可构造官方播放接口直链。
    // 返回 302 跳转到真实 CDN，前端代理可正常跟随。
    if (!videoResUrl && play.uri && !play.uri.startsWith("http")) {
      videoResUrl = `https://www.iesdouyin.com/aweme/v1/play/?video_id=${play.uri}&ratio=1080p&line=0`;
    }

    // 背景音乐/原声音频直链（music.play_url.url_list[0]），供「下载音频」使用
    // 原声视频的 music 即视频本身的声音，配乐视频为背景音乐
    const audioUrl = videoData.music?.play_url?.url_list?.[0]
      ? videoData.music.play_url.url_list[0]
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
        // 音频直链（无则 undefined，前端不显示「下载音频」按钮）
        audioUrl: audioUrl || undefined,
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
export function extractFilterReason(videoInfo) {
  if (!videoInfo || typeof videoInfo !== "object") return null;
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
 * 页面是否命中反爬 JS challenge（无数据壳页面）：
 * _$jsvmprt（旧）与 argus 风控脚本（新，含 'argus-csp-token' / 'precollect'）。
 * 仅用于无有效数据时归类报错原因，不再参与数据解析前的拦截。
 */
export function isChallengeHtml(html) {
  return (
    html.includes("_$jsvmprt") ||
    html.includes("argus-csp-token") ||
    html.includes("precollect")
  );
}

/**
 * 从 URL 中提取视频 ID 和类型
 * 支持：/video|note|story/ID 路径、/share/(video|note|note)/ID、纯长数字、
 * 以及跳转域名的 target 参数（如 link.wtturl.cn/?target=https%3A%2F%2Fwww.iesdouyin.com%2Fshare%2Fvideo%2F<id>）。
 * target 参数里的完整抖音链接即使跳转服务失效（40x）也能直接提取 ID。
 */
export function extractIdFromUrl(urlStr) {
  // 先处理 target 参数：解码后递归提取（wtturl.cn 等跳转域名在域名白名单内，
  // 但跳转服务本身可能不可用，URL 里的 target 就是完整抖音链接）
  try {
    const target = new URL(urlStr).searchParams.get("target");
    if (target) {
      const decoded = decodeURIComponent(target);
      const inner = extractIdFromUrl(decoded);
      if (inner) return inner;
    }
  } catch {
    /* URL 解析失败，继续走常规路径 */
  }

  let match = urlStr.match(/video\/(\d+)/);
  if (match) return { id: match[1], type: "video" };
  match = urlStr.match(/note\/(\d+)/);
  if (match) return { id: match[1], type: "note" };
  match = urlStr.match(/story\/(\d+)/);
  if (match) return { id: match[1], type: "story" };
  // 兜底：找长数字串
  match = urlStr.match(/(\d{15,})/);
  if (match) return { id: match[1], type: "video" };

  // 分享样式 /share/video/xxx /share/note/xxx 的纯 id
  match = urlStr.match(/share\/(video|note)\/(\d+)/);
  if (match) return { id: match[2], type: match[1] };
  return null;
}

/**
 * 从响应头 Set-Cookie 中提取 ttwid（兼容 undici 的多 Set-Cookie 头）
 */
export function extractTtwid(response) {
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
