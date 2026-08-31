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
 * 从抖音直播 reflow 页面 HTML 中解析直播数据。
 *
 * 抖音直播分享短链（v.douyin.com/xxx）重定向到
 * webcast.amemv.com/douyin/webcast/reflow/{room_id}，该 H5 页面内嵌了
 * React Server Component（RSC）数据块：`self.__rsc_f.push([1,"5:[...]"]`，
 * 其中 `5:[...]` 是 RSC 序列化数据，`[...]` 的最后一个元素是 props，
 * 含 `data.room`（房间信息）与 `data.room.streamUrl`（直播流地址）。
 *
 * 无需 a_bogus 签名即可拿到直播流直链（FLV / HLS），返回标准化结果或 null。
 */
export function parseLiveData(html) {
  try {
    // 提取 RSC 数据块：self.__rsc_f.push([1,"5:[...]"]）
    // 页面含多个 push 块（流数据块以 1: 开头、房间数据块以 5: 开头），
    // 需遍历找到含房间信息（data.room）的那个。
    const blocks = html.matchAll(/self\.__rsc_f\.push\(\[1,"(.*?)"\]\)/gs);
    let room = null;
    for (const m of blocks) {
      if (!m?.[1]) continue;
      // 反转义得到 RSC 字符串（形如 5:[...]）
      let rsc;
      try {
        rsc = JSON.parse(`"${m[1]}"`);
      } catch {
        continue;
      }
      if (typeof rsc !== "string" || !rsc.startsWith("5:")) continue;
      // 去掉 "5:" 前缀后是 RSC 数组，最后一个元素是 props
      try {
        const data = JSON.parse(rsc.slice(2));
        const props = Array.isArray(data) ? data[data.length - 1] : null;
        const r = props?.data?.room;
        if (r?.idStr) {
          room = r;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!room) return null;

    const streamUrl = room.streamUrl || {};
    const owner = room.owner || {};

    // 直播流地址：优先 HLS（m3u8，浏览器兼容性最好），其次 FLV
    const hlsUrl = streamUrl.hlsPullUrl || "";
    const flvUrl = streamUrl.rtmpPullUrl || "";
    const flvMap = streamUrl.flvPullUrl || {};
    // 各清晰度 FLV 流（FULL_HD1=蓝光 / HD1=超清 / ORIGION=原画 / SD1=标清 / SD2=高清）
    const qualities = Object.entries(flvMap)
      .map(([key, url]) => ({
        name: streamUrl.resolutionName?.[key] || key,
        url,
      }))
      .filter((q) => q.url);

    const url = hlsUrl || flvUrl || qualities[0]?.url || "";
    if (!url) return null;

    // 观看人数：roomViewStats.displayShort（如 "2.9万"）优先，
    // 其次 popularityStr / webCount / userCount 兜底
    const popularity =
      room.roomViewStats?.displayShort ||
      room.popularityStr ||
      (room.webCount ? String(room.webCount) : "") ||
      (room.userCount ? String(room.userCount) : "") ||
      "";

    return {
      code: 200,
      msg: "解析成功",
      data: {
        title: room.title || "抖音直播",
        author: owner.nickname || "",
        uid: owner.id ? String(owner.id) : "",
        avatar: owner.avatarThumb?.urlList?.[0] || "",
        cover: room.cover?.urlList?.[0] || "",
        // 直播流直链（HLS 优先）
        url,
        // 直播类型标记，前端据此展示「直播中」与多清晰度
        type: "live",
        // 直播状态：2=直播中，其他（3/4 等）为已结束/未开播
        liveStatus: room.status,
        // 观看人数（字符串，如 "2.9万"）
        liveViewerCount: popularity,
        // 多清晰度流（FLV）
        liveQualities: qualities,
        // 房间 ID
        roomId: room.idStr,
        // 分享链接
        shareUrl: room.shareUrl || "",
      },
    };
  } catch (error) {
    logger.error("Error parsing live data:", error);
    return null;
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
 * 判断 URL 是否为抖音「用户主页」分享链接（/share/user/ 路径或带 sec_uid 参数）。
 * 此类链接是博主主页而非具体视频/图文，不含视频 ID，无法解析 ——
 * 用于在短链重定向后给出明确提示，而非笼统的「无法解析视频 ID」。
 */
export function isUserProfileUrl(urlStr) {
  return /\/share\/user\//.test(urlStr) || /[?&]sec_uid=/.test(urlStr);
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

  // 直播链接：webcast.amemv.com/douyin/webcast/reflow/ID（抖音直播分享短链重定向目标）
  // 必须在兜底长数字正则之前匹配，否则会被误判为 video 类型
  let match = urlStr.match(/webcast\/reflow\/(\d+)/);
  if (match) return { id: match[1], type: "live" };
  // 直播链接：live.douyin.com/ID（直播间完整链接，room_id 通常为 12 位数字）
  // 必须在兜底长数字正则之前匹配，否则 12 位 room_id 不满足 15 位兜底会漏识别
  match = urlStr.match(/live\.douyin\.com\/(\d+)/);
  if (match) return { id: match[1], type: "live" };
  // 合集（mix）链接：/share/mix/detail/ID 或 /mix/detail/ID
  // 必须在兜底长数字正则之前匹配，否则会被误判为 video 类型
  match = urlStr.match(/mix\/detail\/(\d+)/);
  if (match) return { id: match[1], type: "mix" };
  match = urlStr.match(/video\/(\d+)/);
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
 * 从 mix/detail 接口响应中提取合集信息
 * 返回 { mixName, cover, author, authorId, avatar, totalEpisodes } 或 null
 */
export function parseMixDetail(mixDetail) {
  try {
    const mixInfo = mixDetail?.mix_info;
    if (!mixInfo?.mix_id) return null;
    const author = mixInfo.author || {};
    return {
      mixName: mixInfo.mix_name || "合集",
      cover: mixInfo.cover_url?.url_list?.[0] || "",
      author: author.nickname || "",
      authorId: author.uid || "",
      avatar: author.avatar_medium?.url_list?.[0] || "",
      totalEpisodes: mixInfo.statis?.updated_to_episode || 0,
    };
  } catch (error) {
    logger.error("Error parsing mix detail:", error);
    return null;
  }
}

/**
 * 从 mix/aweme 接口的 aweme_list 中提取视频列表
 * 返回标准化视频项数组（与 B 站多分P 结构一致，供 data.videos 使用）
 */
export function parseMixAwemeList(awemeList) {
  if (!Array.isArray(awemeList)) return [];
  const videos = [];
  for (const item of awemeList) {
    try {
      const playAddr = item.video?.play_addr || {};
      const urlList = Array.isArray(playAddr.url_list) ? playAddr.url_list : [];
      let videoUrl = urlList[0]
        ? urlList[0].replace("playwm", "play").replace("play_wm", "play")
        : "";
      // uri 兜底直链
      if (!videoUrl && playAddr.uri && !playAddr.uri.startsWith("http")) {
        videoUrl = `https://www.iesdouyin.com/aweme/v1/play/?video_id=${playAddr.uri}&ratio=1080p&line=0`;
      }
      if (!videoUrl) continue;

      const durationMs = item.video?.duration || 0;
      videos.push({
        title: item.desc || "无标题",
        url: videoUrl,
        cover: item.video?.cover?.url_list?.[0] || "",
        duration: durationMs > 0 ? Math.round(durationMs / 1000) : undefined,
        durationFormat: durationMs > 0 ? formatDuration(durationMs) : undefined,
        awemeId: item.aweme_id || "",
        like: item.statistics?.digg_count || 0,
      });
    } catch {
      /* 跳过单个异常视频 */
    }
  }
  return videos;
}

/** 毫秒 → "MM:SS" / "HH:MM:SS" */
function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
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

/**
 * 修复抖音 MP4 的 ftyp 头混淆。
 * 抖音 365yg.com 视频 CDN 会随机把 ftyp box 的 size 字段首字节从 0x00 改成 0x01
 * （如 0x00000020 → 0x01000020），使播放器无法解析文件。
 * 这里检测并还原：仅当第 4-7 字节为 "ftyp" 且 size 首字节为 0x01 时修复。
 * 返回修复后的 Buffer；无需修复时原样返回。
 */
export function fixDouyinFtyp(chunk) {
  if (chunk.length < 8) return chunk;
  // 第 4-7 字节应为 "ftyp"
  if (
    chunk[4] !== 0x66 ||
    chunk[5] !== 0x74 ||
    chunk[6] !== 0x79 ||
    chunk[7] !== 0x70
  ) {
    return chunk;
  }
  // size 首字节为 0x01 视为被混淆（正常应为 0x00）
  if (chunk[0] !== 0x01) return chunk;
  const fixed = Buffer.from(chunk);
  fixed[0] = 0x00;
  return fixed;
}
