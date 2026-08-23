import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import { douyinPublicFallback } from "@/lib/douyinFallback";
import {
  hasValidData,
  tryParseEmbedded,
  parseVideoData,
  extractFilterReason,
  isChallengeHtml,
  extractIdFromUrl,
  extractTtwid,
} from "@/lib/douyin-extract";

// Docker 自托管下 Node runtime 对外网 fetch 通常比 Edge 沙箱更稳定（抖音等站）
export const runtime = "nodejs";

// 多组 UA 轮询（参考 video-unwatermark sharepage.py 的 DOUYIN_HEADER_SETS）。
// 顺序关键：抖音 App UA（aweme/...）实测是唯一会下发 ttwid 的 UA，
// 必须先用它建立 ttwid，再带 ttwid 用其他 UA 请求数据。
// 最小化请求头 — 过多的 sec-ch-ua / desktop 头与 mobile UA 混用会触发抖音反爬
const MOBILE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

const UA_SETS = [
  {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 aweme/32.7.0 NetType/WIFI Channel/App Store",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
  },
  MOBILE_HEADERS,
  {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
  },
];

// 北京时间格式化（日志用）：YYYY-MM-DD HH:mm:ss
function beijingNow() {
  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date()).replace(/\//g, "-");
}

async function douyin(url) {
  try {
    const DOUYIN_COOKIE = process.env.DOUYIN_COOKIE || "";

    // ---- Step 1: 从短链 / 分享链接中提取视频 ID 和完整重定向 URL ----
    const extractResult = await extractIdAndRedirectUrl(url);
    if (!extractResult) {
      logger.warn(
        `[${beijingNow()}] 解析抖音链接失败：无法提取视频 ID（${url.slice(0, 60)}）`
      );
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
    // 整体请求预算：2 轮 × 3 组 UA × 4 URL 最坏可能很慢，用 20s 硬上限兜底
    const startTime = Date.now();
    const buildFetchHeaders = (ua) => {
      const headers = { ...ua };
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
    // 记录最后一次成功解析出 _ROUTER_DATA 的数据（即使 item_list 为空）：
    // 抖音对已删除/不存在的视频会返回 filter_list 而非数据，需要据此给准确报错
    let lastRouterData = null;
    // 反爬命中的域名计数（用于最终一行汇总，避免逐 URL 刷日志）
    let challengeCount = 0;

    // 最多两轮 × 多组 UA × 多 URL：
    // 第一轮拿 ttwid（可能无数据），第二轮带 ttwid 拿数据。
    // 修复点（2026-08-22，参考 video-unwatermark sharepage.py）：
    // 带 ttwid 的分享页会同时携带 argus 风控脚本与真实 _ROUTER_DATA，
    // 因此必须先尝试解析数据、数据有效即胜出；反爬特征仅用于无数据时归类报错，
    // 绝不能因为页面含 argus-csp-token 就跳过 —— 那是此前解析全部失败的根因。
    for (let round = 0; round < 2 && !videoInfo; round++) {
      for (const ua of UA_SETS) {
        for (const fetchUrl of tryUrls) {
          if (videoInfo) break;
          if (Date.now() - startTime > 20000) break;
          try {
            const response = await fetch(fetchUrl, {
              headers: buildFetchHeaders(ua),
              signal: AbortSignal.timeout(8000),
            });
            const html = await response.text();
            lastHtml = html;

            // 从响应头收集 ttwid，供后续请求使用（App UA 才会下发）
            const newTtwid = extractTtwid(response);
            if (newTtwid && ttwidCookie !== newTtwid) {
              ttwidCookie = newTtwid;
            }

            // 检查是否被重定向到国际版
            if (html.includes("tiktok.com") || html.includes("访问受限")) {
              continue;
            }

            // 先解析内嵌数据（_ROUTER_DATA / RENDER_DATA / _SSR_DATA）
            const parsed = tryParseEmbedded(html);
            if (parsed) {
              if (hasValidData(parsed)) {
                videoInfo = parsed;
                break;
              }
              // 空壳 / 被过滤：保留结构供后续给出准确报错
              lastRouterData = parsed;
            } else if (isChallengeHtml(html)) {
              // 页面完全无数据块且带反爬特征：命中 challenge，计数供报错
              challengeCount++;
            }
          } catch {
            /* 网络异常跳过该 URL，尝试下一个 */
          }
        }
      }
    }

    if (!videoInfo) {
      // 优先给出抖音服务端的过滤原因（如 SYSTEM_ITEM_NOT_EXIST = 视频不存在/已删除）
      const filterReason = extractFilterReason(lastRouterData);

      // 视频真实存在（无过滤原因）但分享页拿不到数据 → 公共解析 API 兜底
      // （参考 video-unwatermark 的 webparser 引擎：17change/douyin.wtf/yujn/tenapi 竞速）
      if (!filterReason) {
        try {
          const fb = await douyinPublicFallback(url);
          if (fb.ok && fb.url) {
            logger.log(
              `[${beijingNow()}] 解析抖音链接 ${id} 成功（公共解析兜底 ${fb.key}）`
            );
            return {
              code: 200,
              msg: "解析成功",
              data: {
                author: "",
                uid: "",
                avatar: "",
                like: 0,
                time: 0,
                title: fb.title || "视频",
                cover: fb.cover || "",
                type: "video",
                url: fb.url,
                duration: 0,
              },
            };
          }
        } catch (error) {
          logger.warn(
            `[${beijingNow()}] 解析抖音链接 ${id} 公共解析兜底异常: ${error.message}`
          );
        }
      }

      if (filterReason) {
        logger.warn(
          `[${beijingNow()}] 解析抖音链接 ${id} 失败：抖音服务端过滤（${filterReason}）`
        );
        return {
          code: 201,
          msg: `解析失败：抖音服务端过滤了该内容（${filterReason}），视频可能已删除或为隐私内容`,
        };
      }
      // 所有请求都命中反爬 JS challenge（argus / _$jsvmprt）：IP 被抖音风控，
      // 需配置 DOUYIN_COOKIE（带有效浏览器 cookie）或更换网络出口
      const isAntiBot = challengeCount > 0;
      if (isAntiBot) {
        logger.warn(
          `[${beijingNow()}] 解析抖音链接 ${id} 失败：抖音风控拦截（${challengeCount} 次请求均被反爬）`
        );
        return {
          code: 201,
          msg: "解析失败：抖音风控拦截了本次请求（网络出口被限流），请稍后重试，或联系站长配置有效的抖音 Cookie",
        };
      }
      // 记录部分响应内容用于诊断（截取前 500 字符）
      const snippet = lastHtml.replace(/\s+/g, " ").slice(0, 500);
      logger.warn(
        `[${beijingNow()}] 解析抖音链接 ${id} 失败：未获取到页面数据。Response: ${snippet}`
      );
      // 已自动携带匿名 ttwid 仍拿不到数据：多为视频不存在 / 已删除 / 被过滤
      return {
        code: 201,
        msg: "解析失败：未能从页面获取视频数据，可能是视频不存在、已删除或页面结构变化",
      };
    }

    if (!videoInfo.loaderData) {
      logger.warn(
        `[${beijingNow()}] 解析抖音链接 ${id} 失败：视频数据结构异常`
      );
      return {
        code: 201,
        msg: "解析失败：视频数据结构异常，可能是抖音接口发生变化",
      };
    }

    // ---- Step 3: 提取视频 / 图文数据 ----
    const parseResult = parseVideoData(videoInfo);
    if (parseResult) {
      if (parseResult.code === 200) {
        const t = parseResult.data?.title || "";
        logger.log(
          `[${beijingNow()}] 解析抖音链接 ${id} 成功${t ? `：《${t.slice(0, 30)}》` : ""}`
        );
      } else {
        logger.warn(
          `[${beijingNow()}] 解析抖音链接 ${id} 失败：${parseResult.msg}`
        );
      }
      return parseResult;
    }

    // ---- Step 4: 分享页数据为空 — 提取 filter_list 给出明确错误 ----
    const filterReason = extractFilterReason(videoInfo);
    if (filterReason) {
      logger.warn(
        `[${beijingNow()}] 解析抖音链接 ${id} 失败：抖音服务端过滤（${filterReason}）`
      );
      return {
        code: 201,
        msg: `解析失败：抖音服务端过滤了该内容（${filterReason}），部分视频（如实况图、刚发布的内容）暂不支持解析`,
      };
    }

    logger.warn(
      `[${beijingNow()}] 解析抖音链接 ${id} 失败：未能从页面获取视频数据`
    );
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
 * 从 URL 中提取视频 ID 和完整重定向 URL
 * 返回 { id, type, redirectUrl } 或 null
 * （网络相关逻辑保留在路由层，提取/解析纯函数见 lib/douyin-extract.js）
 */
async function extractIdAndRedirectUrl(url) {
  try {
    const response = await fetch(url, {
      headers: MOBILE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
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

export const GET = createApiHandler(douyin);
