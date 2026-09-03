import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import {
  extractBilibiliAnonCookie,
  getBiliAnonCookie,
  saveBiliAnonCookie,
} from "@/lib/bilibili-cookie";

export const runtime = "nodejs";

// 模块级匿名 Cookie 缓存：单次请求内复用，避免每次 fetch 都查库。
// 首次从 Turso 读取，后续请求内直接复用；响应返回新 Cookie 时更新。
let anonCookieCache = "";

// 从环境变量获取配置
const BILIBILI_USER_AGENT = process.env.BILIBILI_USER_AGENT || 
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36";

// B站按请求出口 IP 分配 CDN 节点：海外出口（如本服务器在新加坡）拿到 akamaized.net
// 海外节点，大陆用户浏览器无法播放。直链签名（upsig/uparams）不绑定 host，
// 把海外 host 归一化为国内镜像节点（bilivideo.com）即可在大陆正常播放。
const BILI_CN_HOST = "upos-sz-mirrorbd.bilivideo.com";

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
async function bilibiliRequest(url, headers, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: buildBilibiliHeaders(headers),
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

async function getBilibiliVideoInfo(url) {
  try {
    // 首次进入时从 Turso 加载持久化的匿名 Cookie 到模块缓存（仅加载一次，
    // 后续请求内直接复用；未配置 Turso 时静默跳过）。
    if (!anonCookieCache) {
      anonCookieCache = await getBiliAnonCookie();
    }
    const cleanUrl = cleanUrlParameters(url);
    const parsedUrl = new URL(cleanUrl);
    let bvid;
    
    if (parsedUrl.hostname === "b23.tv") {
      // b23.tv 短链重定向：带 UA + Referer，避免海外出口被 B站风控拦截
      const response = await fetch(url, {
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
      return { code: -1, msg: "好像不是视频链接" };
    }
    
    // 提取 BV 号：b23.tv 重定向后 pathname 形如 /video/BV1sK826SENY/（带尾斜杠），
    // 简单地 replace("/video/","") 会残留 "/" 导致 B站 API 返回 code=-400 请求错误
    // （2026-08-25 实测：BV1sK826SENY/ → -400，BV1sK826SENY → 0 OK）。
    const bvidMatch = bvid.match(/\/(video|bilibili)\/([A-Za-z0-9_]+)\/?/);
    bvid = (bvidMatch ? bvidMatch[2] : bvid).replace(/\/+$/, "");
    logger.log("Processing bilibili video, bvid:", bvid);
    
    const headers = { "Content-Type": "application/json;charset=UTF-8" };
    
    // 获取视频信息
    const videoInfo = await bilibiliRequest(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      headers
    );
    
    if (!videoInfo || videoInfo.code !== 0) {
      logger.warn("Failed to fetch video info, response:", videoInfo);
      // 区分「视频不存在/已删除」与「风控拦截」：前者是确定失败，后者是临时风控
      if (videoInfo && RISK_CODES.has(videoInfo.code)) {
        return { code: 0, msg: "B站风控拦截，请稍后重试" };
      }
      if (videoInfo && (videoInfo.code === -404 || videoInfo.code === 62002)) {
        return { code: 0, msg: "视频不存在或已删除" };
      }
      return { code: 0, msg: "解析失败！" };
    }
    
    // 并行获取所有分P的播放地址
    const playUrlPromises = videoInfo.data.pages.map(async (page) => {
      const playUrl = await bilibiliRequest(
        `https://api.bilibili.com/x/player/playurl?otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=${bvid}&cid=${page.cid}&platform=html5&high_quality=1`,
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
        imgurl: videoInfo.data.pic,
        desc: videoInfo.data.desc,
        user: {
          name: videoInfo.data.owner.name,
          user_img: videoInfo.data.owner.face,
        },
      };
    }
    
    logger.log("Successfully parsed bilibili video, pages:", bilijson.length);
    
    return {
      code: 1,
      msg: "解析成功！",
      title: videoInfo.data.title,
      imgurl: videoInfo.data.pic,
      desc: videoInfo.data.desc,
      data: bilijson,
      user: {
        name: videoInfo.data.owner.name,
        user_img: videoInfo.data.owner.face,
      },
    };
  } catch (error) {
    logger.error("Error parsing bilibili video:", error.message);
    return { code: 0, msg: "解析失败！" };
  }
}

export const GET = createApiHandler(getBilibiliVideoInfo, {
  shouldCache: false,
  responseHeaders: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  },
});
