/**
 * 哔哩哔哩解析（纯函数模块，无 HTTP 边界）
 * 由 /api/bilibili 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { logger, DELETED_CONTENT_MSG } from "@/lib/api-utils";
import {
  extractBilibiliAnonCookie,
  getBiliAnonCookie,
  saveBiliAnonCookie,
} from "@/lib/bilibili-cookie";
import { signWbiParams } from "@/lib/bilibili-wbi";
import { biliFetch, BILIBILI_USER_AGENT } from "@/lib/bilibili-fetch";


// 模块级匿名 Cookie 缓存：单次请求内复用，避免每次 fetch 都查库。
// 首次从 Turso 读取，后续请求内直接复用；响应返回新 Cookie 时更新。
let anonCookieCache = "";

// 从环境变量获取配置（UA 已统一写死在 bilibili-fetch.js，此处无需重复配置）

// B站按请求出口 IP 分配 CDN 节点：海外出口（如本服务器在新加坡）拿到 akamaized.net
// 海外节点，大陆用户浏览器无法播放。直链签名（upsig/uparams）不绑定 host，
// 把海外 host 归一化为国内镜像节点（bilivideo.com）即可在大陆正常播放。
const BILI_CN_HOST = "upos-sz-mirrorbd.bilivideo.com";

// 本地生成稳定 buvid3 兜底：B站对「无 Cookie 裸请求」风控最严，而匿名 Cookie
// 只有在请求成功后才会从响应头捕获——被 -412 拦截的 IP 永远等不到下发（死循环）。
// 参照 B站前端 buvid3 格式（UUID 大写 + infoc 后缀）本地生成一个进程级稳定的
// 设备指纹直接带上，配合 WBI 签名把「裸请求」特征清零。
function generateBuvid3() {
  const hex = (n) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join("");
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(4)}${hex(8)}infoc`;
}

// B站图床（封面/头像）防盗链：hdslb.com 对外站 Referer 返回 403，且返回的是
// http 链接在 HTTPS 页面触发混合内容。参照小红书解析的做法，统一转成本站
// /api/image 图片代理（代理侧带 bilibili Referer，见 api/image/route.js）。
function proxyBiliImage(url) {
  if (!url) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function normalizeCdnHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".akamaized.net")) {
      parsed.hostname = BILI_CN_HOST;
      return parsed.toString();
    }
  } catch (error) {
    logger.error("Error normalizing CDN host:", error.message);
  }
  return url;
}

function cleanUrlParameters(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.toString();
  } catch (error) {
    logger.error("Error cleaning URL:", error.message);
    return url;
  }
}

// B站风控/反爬返回的错误码：海外出口（Cloudflare Workers 等）请求频繁时，
// B站会临时拦截（code=-412 风控 / -403 无权限），此时重试通常可恢复。
const RISK_CODES = new Set([-412, -403, -400]);

// 判断响应是否为 HTML（B站对海外 IP 风控时，API 接口会返回 HTML 拦截页而非 JSON，
// 形如 "<!DOCTYPE html>..."，response.json() 会抛 "Unexpected token '<'"）。
function isHtmlResponse(text) {
  return /^\s*<!DOCTYPE|^\s*<html/i.test(text);
}

// 补全浏览器请求头，让 B 站风控认为请求来自真实浏览器而非爬虫。
// 海外出口（新加坡服务器）仅靠 UA/Referer 仍可能被风控，补全这些头 + 稳定
// 复用的匿名 Cookie（buvid3 等设备指纹）可显著降低被拦截概率。
function buildBilibiliHeaders(extra = {}) {
  const headers = {
    ...extra,
    "User-Agent": BILIBILI_USER_AGENT,
    // B站 API 要求 Referer：海外出口（如 GitHub Actions / 海外服务器）不带
    // 正确 Referer 会被风控返回 code=-412/-403，带上 bilibili.com 来源
    // 可正常返回国内数据。
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "X-Requested-With": "XMLHttpRequest",
  };
  // 带上稳定复用的匿名 Cookie（buvid3 等设备指纹），让 B 站认为请求来自
  // 正常浏览的游客而非爬虫，显著降低海外出口被风控的概率。
  if (anonCookieCache) {
    headers.Cookie = anonCookieCache;
  }
  return headers;
}

// 带重试的 B 站 API 请求：网络错误、风控码、或 HTML 拦截页时重试（最多 2 次，
// 间隔递增），规避海外出口被 B 站临时风控导致的偶发「解析失败」。
// opts 透传给 biliFetch（如 biliDirect=true：跳过中继用本机出口直连）。
// opts.timeout：单次尝试的硬超时（毫秒），每次重试各自新建 AbortSignal。
// 中继模式下覆盖 biliFetch 的兜底 20s，直连模式下同样生效——B站个别接口
// 会整段挂起（pgc/view/web/season 2026-11-05 线上实证），没有它 3 次重试
// × 20s 就是 60s+ 的用户等待。
async function bilibiliRequest(url, headers, retries = 2, opts = {}) {
  const { timeout, ...requestOpts } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await biliFetch(url, {
        headers: buildBilibiliHeaders(headers),
        ...requestOpts,
        ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {}),
      });
      // 从响应头捕获 B 站下发的匿名 Cookie（首次访问会自动下发 buvid3 等），
      // 更新模块缓存并异步持久化，供后续请求稳定复用。
      const newCookie = extractBilibiliAnonCookie(response);
      if (newCookie && newCookie !== anonCookieCache) {
        anonCookieCache = newCookie;
        saveBiliAnonCookie(newCookie); // fire-and-forget，不阻塞主流程
      }
      const text = await response.text();
      // 返回 HTML 拦截页：海外 IP 被风控，重试通常可恢复
      if (isHtmlResponse(text)) {
        if (attempt < retries) {
          logger.warn(
            `B站返回 HTML 拦截页（海外IP风控），第 ${attempt + 1} 次重试: ${url.slice(0, 80)}`
          );
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        logger.error("B站持续返回 HTML 拦截页（海外IP被风控）:", url.slice(0, 80));
        return { code: -412, msg: "风控拦截", html: true };
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // 非 JSON 也非 HTML（异常响应）：按网络错误重试
        if (attempt < retries) {
          logger.warn(
            `bilibili 响应非 JSON，第 ${attempt + 1} 次重试: ${url.slice(0, 80)}`
          );
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        logger.error("bilibili 响应非 JSON:", text.slice(0, 200));
        return null;
      }
      // 命中风控码且还有重试次数：短暂等待后重试
      if (json && RISK_CODES.has(json.code) && attempt < retries) {
        logger.warn(
          `B站风控码 ${json.code}，第 ${attempt + 1} 次重试: ${url.slice(0, 80)}`
        );
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      return json;
    } catch (error) {
      // 网络错误（超时/断连）：还有重试次数则重试
      if (attempt < retries) {
        logger.warn(
          `bilibili 请求网络错误(${error.message})，第 ${attempt + 1} 次重试`
        );
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      logger.error("Error making bilibili request:", error.message);
      return null;
    }
  }
  return null;
}

/**
 * playurl 统一签发出口：先本机直连（biliDirect），出口相关失败再回退中继。
 *
 * 背景（2026-11-01）：B站 playurlv3 直链把签发方 IP（oi 参数）绑进签名校验，
 * 取流客户端 IP 必须等于签发方，否则 403。playurl 由本机直连签发时
 * oi=本服务出口，video-proxy（同样走本机出口）取流即可播放；经中继签发的
 * 链接只有中继取得出流。所以直连优先，只有直连被出口因素挡住才回退中继：
 * - RISK_CODES（-412/-403/-400/-352 风控）：海外数据中心 IP 偶发；
 * - -10403：番剧地区限制（CI 美国 IP 实测，大陆出口正常）。
 * 回退签发的链接 oi=中继 IP，video-proxy 直连 403 后会回退中继流式取流。
 */
const PLAYURL_EGRESS_FAIL_CODES = new Set([...RISK_CODES, -10403]);

async function requestPlayurl(playUrlUrl, headers) {
  const direct = await bilibiliRequest(playUrlUrl, headers, 2, {
    biliDirect: true,
  });
  if (direct && !PLAYURL_EGRESS_FAIL_CODES.has(direct.code)) return direct;
  logger.warn(
    `playurl 直连签发失败(code=${direct?.code ?? "null"})，回退中继出口: ${playUrlUrl.slice(0, 80)}`
  );
  return bilibiliRequest(playUrlUrl, headers, 2);
}

/**
 * 番剧 playurl 统一签发：WBI 签名拿不到密钥时降级裸请求，直连/中继出口
 * 由 requestPlayurl 决定（oi 绑定逻辑见其注释）。
 * @returns {{ playUrl: object|null, playData: object|null, durl: object|null }}
 *   番剧与普通稿件的响应层级不同（result vs data），这里两者都兜；
 *   playUrl 是整个响应信封（业务码在顶层），durl 为 null 表示没拿到地址
 */
async function issueBangumiPlayurl(playParams, headers) {
  const signedPlayQuery = await signWbiParams(playParams);
  const plainPlayQuery = Object.entries(playParams)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const playUrl = await requestPlayurl(
    `https://api.bilibili.com/pgc/player/web/playurl?${signedPlayQuery ?? plainPlayQuery}`,
    headers
  );
  const playData = playUrl?.result || playUrl?.data;
  return { playUrl, playData, durl: playData?.durl?.[0] };
}

/**
 * season 接口网络级失败（超时/不可达）时的降级：仅凭 ep_id 直取 playurl。
 * 背景：pgc/view/web/season 会整段挂起（2026-11-05 线上实证：4 次请求
 * × 中继超时全失败，同期普通稿件接口正常），而 playurl 是另一条服务路径，
 * ep_id 单参即可签发（2026-11-06 实测 code=0 返回 durl）。代价是拿不到
 * 剧集元信息，标题/封面只能占位——有播放地址总好过整个解析失败。
 * 仅 kind="ep" 可降级（ss 链接没有 ep_id，连第一集号都拿不到）。
 * @returns {object|null} 与正常路径同构的成功结果；降级也失败返回 null
 */
async function bangumiPlayurlOnlyFallback(epId, headers) {
  const { playUrl, playData, durl } = await issueBangumiPlayurl(
    {
      ep_id: epId,
      qn: 112,
      fnval: 1,
      fnver: 0,
      otype: "json",
      platform: "html5",
      high_quality: 1,
    },
    headers
  );
  if (!durl?.url) {
    const vipOnly = playUrl?.code === -10403 || playData?.is_preview === 1;
    logger.warn(
      "bilibili bangumi playurl-only 降级失败:",
      epId,
      playUrl?.code,
      playData?.is_preview
    );
    // 大会员专享是 B站的明确答复，给出与正常路径一致的文案；
    // 其余（网络错/风控）返回 null，调用方回落原有错误文案
    return vipOnly
      ? {
          code: 0,
          msg: "该剧集为大会员专享，匿名无法获取播放地址",
          title: `哔哩哔哩番剧 ep${epId}`,
          imgurl: "",
          desc: "",
          user: { name: "", user_img: "" },
        }
      : null;
  }
  const title = `哔哩哔哩番剧 ep${epId}`;
  const durationSec = Math.max(
    1,
    Math.round(Number(playData?.timelength || 0) / 1000)
  );
  logger.log("Successfully parsed bilibili bangumi (season 降级):", epId);
  return {
    code: 1,
    msg: "解析成功！",
    title,
    imgurl: "",
    desc: "",
    data: [
      {
        title,
        duration: durationSec,
        durationFormat: new Date((durationSec - 1) * 1000)
          .toISOString()
          .substr(11, 8),
        accept: playData.accept_description,
        video_url: normalizeCdnHost(durl.url),
      },
    ],
    user: { name: "", user_img: "" },
  };
}

/**
 * 番剧（PGC）解析：/bangumi/play/ep<id>（单集）或 /bangumi/play/ss<id>（整季）
 *
 * 不能复用 UP 主稿件那套接口：番剧的 bvid 在 /x/web-interface/view 下能查到
 * （会被当成普通稿件返回 pages），但 /x/player/playurl 对它一律回 -404「啥都木有」
 * （2026-09-23 实测），必须走 PGC 专用接口：
 *   /pgc/view/web/season?ep_id=|season_id=   取剧集列表（含 cid / ep_id）
 *   /pgc/player/web/playurl                   取播放地址
 * 匿名 Cookie 下正常剧集可达 1080P；会员专享集会返回 -10403 / is_preview=1，
 * 此时仍返回剧集信息 + 明确提示，而不是笼统的「解析失败」。
 *
 * @param {"ep"|"ss"} kind ep=单集，ss=整季（取第一集）
 * @param {string} id 数字 ID
 */
async function getBilibiliBangumiInfo(kind, id) {
  try {
    const headers = { "Content-Type": "application/json;charset=UTF-8" };
    const seasonQuery =
      kind === "ep" ? `ep_id=${id}` : `season_id=${id}`;

    // season 接口单次 10s 硬超时：3 次尝试最坏 ~31s（原先依赖中继兜底 20s
    // × 3 + 退避 ≈ 61s，2026-11-05 线上 ep3854822 挂起时用户干等一分钟）。
    // 接口响应本身是剧集列表 JSON，正常远小于 10s。
    const season = await bilibiliRequest(
      `https://api.bilibili.com/pgc/view/web/season?${seasonQuery}`,
      headers,
      2,
      { timeout: 10000 }
    );

    if (!season || season.code !== 0 || !season.result) {
      logger.warn("Failed to fetch bangumi season:", kind, id, season?.code);
      if (season && RISK_CODES.has(season.code)) {
        return { code: 0, msg: "B站风控拦截，请稍后重试" };
      }
      if (season && (season.code === -404 || season.code === 600404)) {
        return { code: 0, msg: DELETED_CONTENT_MSG };
      }
      // season 网络级失败（null）：playurl 是另一条服务路径，ep_id 单参可签发，
      // 降级直取播放地址而非直接报「解析失败！」（见 bangumiPlayurlOnlyFallback）
      if (!season && kind === "ep") {
        const degraded = await bangumiPlayurlOnlyFallback(id, headers);
        if (degraded) return degraded;
      }
      return { code: 0, msg: "解析失败！" };
    }

    const info = season.result;
    const episodes = Array.isArray(info.episodes) ? info.episodes : [];
    // ep 链接按 ep_id 精确匹配；ss 链接取第一集（与网页端默认打开的行为一致）
    const episode =
      (kind === "ep" &&
        episodes.find((e) => String(e.ep_id) === String(id))) ||
      episodes[0];
    if (!episode) {
      logger.warn("bangumi season has no episode:", kind, id);
      return { code: 0, msg: DELETED_CONTENT_MSG };
    }

    const episodeLabel = episode.title ? `第${episode.title}集` : "";
    const title =
      [info.title, episodeLabel, episode.long_title]
        .filter(Boolean)
        .join(" ") || info.title || "番剧";
    const cover = proxyBiliImage(episode.cover || info.cover);
    const upInfo = info.up_info || (info.staff && info.staff[0]) || {};
    const user = {
      name: upInfo.uname || upInfo.name || info.title || "",
      user_img: proxyBiliImage(upInfo.avatar || upInfo.face || ""),
    };
    const durationSec = Math.max(
      1,
      Math.round(Number(episode.duration || info.duration || 0) / 1000)
    );

    // WBI 签名同样适用于 PGC 接口（算法一致），拿不到密钥时降级裸请求
    const playParams = {
      ep_id: episode.ep_id,
      cid: episode.cid,
      qn: 112,
      fnval: 1,
      fnver: 0,
      otype: "json",
      platform: "html5",
      high_quality: 1,
    };
    const { playUrl, playData, durl } = await issueBangumiPlayurl(
      playParams,
      headers
    );

    if (!durl?.url) {
      const vipOnly = playUrl?.code === -10403 || playData?.is_preview === 1;
      logger.warn(
        "bilibili bangumi playurl failed:",
        kind,
        id,
        playUrl?.code,
        playData?.is_preview
      );
      return {
        code: 0,
        msg: vipOnly
          ? "该剧集为大会员专享，匿名无法获取播放地址"
          : "获取播放地址失败，请稍后重试",
        title,
        imgurl: cover,
        desc: info.evaluate || "",
        user,
      };
    }

    logger.log("Successfully parsed bilibili bangumi:", kind, id);

    return {
      code: 1,
      msg: "解析成功！",
      title,
      imgurl: cover,
      desc: info.evaluate || "",
      data: [
        {
          title,
          duration: durationSec,
          durationFormat: new Date((durationSec - 1) * 1000)
            .toISOString()
            .substr(11, 8),
          accept: playData.accept_description,
          video_url: normalizeCdnHost(durl.url),
        },
      ],
      user,
    };
  } catch (error) {
    logger.error("Error parsing bilibili bangumi:", error.message);
    return { code: 0, msg: "解析失败！" };
  }
}

async function getBilibiliVideoInfo(url) {
  try {
    // 首次进入时从 Turso 加载持久化的匿名 Cookie 到模块缓存（仅加载一次，
    // 后续请求内直接复用；未配置 Turso 时静默跳过）。仍无 Cookie（如 IP 被风控
    // 等不到 B站下发）时本地生成稳定 buvid3 兜底，避免裸请求。
    if (!anonCookieCache) {
      anonCookieCache = await getBiliAnonCookie();
    }
    if (!anonCookieCache) {
      anonCookieCache = `buvid3=${generateBuvid3()}`;
    }
    const cleanUrl = cleanUrlParameters(url);
    const parsedUrl = new URL(cleanUrl);
    let bvid;
    
    if (parsedUrl.hostname === "b23.tv") {
      // b23.tv 短链重定向：带 UA + Referer，避免海外出口被 B站风控拦截
      const response = await biliFetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": BILIBILI_USER_AGENT,
          Referer: "https://www.bilibili.com/",
        },
      });
      const redirectUrl = new URL(response.url);
      bvid = redirectUrl.pathname;
    } else if (
      parsedUrl.hostname === "www.bilibili.com" ||
      parsedUrl.hostname === "m.bilibili.com"
    ) {
      bvid = parsedUrl.pathname;
    } else {
      return { code: -1, msg: "视频链接好像不太对！" };
    }
    
    if (!bvid.includes("/video/")) {
      // 番剧（PGC）：b23.tv/ep675522 → /bangumi/play/ep675522，
      // www.bilibili.com/bangumi/play/ss42916 → /bangumi/play/ss42916。
      // 这条分支原来直接被判「好像不是视频链接」（2026-09-22 线上 3 次连续失败）。
      const bangumiMatch = bvid.match(/\/bangumi\/play\/(ep|ss)(\d+)/);
      if (bangumiMatch) {
        return await getBilibiliBangumiInfo(bangumiMatch[1], bangumiMatch[2]);
      }
      return { code: -1, msg: "好像不是视频链接" };
    }
    
    // 提取 BV 号：b23.tv 重定向后 pathname 形如 /video/BV1sK826SENY/（带尾斜杠），
    // 简单地 replace("/video/","") 会残留 "/" 导致 B站 API 返回 code=-400 请求错误
    // （2026-08-25 实测：BV1sK826SENY/ → -400，BV1sK826SENY → 0 OK）。
    const bvidMatch = bvid.match(/\/(video|bilibili)\/([A-Za-z0-9_]+)\/?/);
    bvid = (bvidMatch ? bvidMatch[2] : bvid).replace(/\/+$/, "");
    logger.log("Processing bilibili video, bvid:", bvid);
    
    const headers = { "Content-Type": "application/json;charset=UTF-8" };

    // WBI 签名：B站 Web API 要求携带 wts + w_rid，缺失会被风控拦截（-412）。
    // 拿不到签名密钥时降级为裸请求（保持旧行为，靠重试兜底）。
    const signedViewQuery = await signWbiParams({ bvid });

    // 获取视频信息
    const videoInfo = await bilibiliRequest(
      `https://api.bilibili.com/x/web-interface/view?${signedViewQuery ?? `bvid=${bvid}`}`,
      headers
    );
    
    if (!videoInfo || videoInfo.code !== 0) {
      logger.warn("Failed to fetch video info, response:", videoInfo);
      // 区分「视频不存在/已删除」与「风控拦截」：前者是确定失败（-404/62002 不在
      // RISK_CODES 重试名单内，直接返回不重试），后者是临时风控
      if (videoInfo && RISK_CODES.has(videoInfo.code)) {
        return { code: 0, msg: "B站风控拦截，请稍后重试" };
      }
      if (videoInfo && (videoInfo.code === -404 || videoInfo.code === 62002)) {
        return { code: 0, msg: DELETED_CONTENT_MSG };
      }
      return { code: 0, msg: "解析失败！" };
    }
    
    // 并行获取所有分P的播放地址
    const playUrlPromises = videoInfo.data.pages.map(async (page) => {
      const signedPlayQuery = await signWbiParams({
        otype: "json",
        fnver: 0,
        fnval: 3,
        player: 3,
        qn: 112,
        bvid,
        cid: page.cid,
        platform: "html5",
        high_quality: 1,
      });
      const playUrl = await requestPlayurl(
        `https://api.bilibili.com/x/player/playurl?${signedPlayQuery ?? `otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=${bvid}&cid=${page.cid}&platform=html5&high_quality=1`}`,
        headers
      );
      
      if (playUrl && playUrl.data?.durl?.[0]?.url) {
        // 直链 host 归一化：海外 akamaized 节点 → 国内 bilivideo.com 节点（签名不绑定 host）
        const video_url = normalizeCdnHost(playUrl.data.durl[0].url);
        return {
          title: page.part,
          duration: page.duration,
          durationFormat: new Date((page.duration - 1) * 1000)
            .toISOString()
            .substr(11, 8),
          accept: playUrl.data.accept_description,
          video_url,
        };
      }
      return null;
    });
    
    const bilijson = (await Promise.all(playUrlPromises)).filter(Boolean);
    
    // 所有分P的播放地址都拿不到（如风控/版权限制）：仍返回视频信息，但提示播放地址获取失败
    if (bilijson.length === 0) {
      logger.warn("bilibili playurl all failed, bvid:", bvid);
      return {
        code: 0,
        msg: "获取播放地址失败，请稍后重试",
        title: videoInfo.data.title,
        imgurl: proxyBiliImage(videoInfo.data.pic),
        desc: videoInfo.data.desc,
        user: {
          name: videoInfo.data.owner.name,
          user_img: proxyBiliImage(videoInfo.data.owner.face),
        },
      };
    }
    
    logger.log("Successfully parsed bilibili video, pages:", bilijson.length);
    
    return {
      code: 1,
      msg: "解析成功！",
      title: videoInfo.data.title,
      imgurl: proxyBiliImage(videoInfo.data.pic),
      desc: videoInfo.data.desc,
      data: bilijson,
      user: {
        name: videoInfo.data.owner.name,
        user_img: proxyBiliImage(videoInfo.data.owner.face),
      },
    };
  } catch (error) {
    logger.error("Error parsing bilibili video:", error.message);
    return { code: 0, msg: "解析失败！" };
  }
}

export default getBilibiliVideoInfo;
