import { createApiHandler } from "@/lib/api-middleware";

export const runtime = "nodejs";

/**
 * 微博视频解析（游客模式，无需登录 Cookie）
 *
 * 背景：2026-08 起微博对无 Cookie 的服务端请求全部 302 到登录墙（passport.weibo.com），
 * 旧实现依赖环境变量 WEIBO_COOKIE，未配置时 component 接口拿不到数据 → 全量解析失败。
 *
 * 本实现不依赖任何用户配置：
 *  1. 自动通过 passport.weibo.com 获取「游客通行证」Cookie（无登录态即可发放）；
 *  2. 用游客 Cookie 请求 m.weibo.cn 公开 JSON 接口（page_info.media_url 即视频直链）；
 *  3. 失败降级 → 游客 Cookie + 旧 tv/api/component。
 *
 * 游客 Cookie 运行时获取、用完即弃，不读环境变量、无持久化。
 */

const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TIMEOUT_MS = 8000;

/**
 * 从各种微博分享链接形态中提取视频 oid（形如 "1034:5336206955708503"）。
 * 支持：tv/show/{id}、show?fid={id}、video.weibo.com/show、纯数字等。
 */
function extractId(rawUrl) {
  let id = null;
  if (rawUrl.includes("show?fid=")) {
    const m = rawUrl.match(/fid=([^&]+)/);
    id = m ? m[1] : null;
  } else if (rawUrl.includes("tv/show/")) {
    const m = rawUrl.match(/tv\/show\/([^?&/]+)/);
    id = m ? m[1] : null;
  } else {
    const m = rawUrl.match(/\d+\:\d+/);
    id = m ? m[0] : null;
  }
  // 兜底：weibo.com/{uid}/{mid} 详情页，取 16 位纯数字 mid
  if (!id) {
    const m = rawUrl.match(/(\d{16})/);
    id = m ? m[1] : null;
  }
  return id ? decodeURIComponent(id) : null;
}

/** 获取微博游客通行凭据（SUB 等）。访问 passport 入口即可，无需登录。 */
async function getVisitorCookie() {
  try {
    const res = await fetch(
      "https://passport.weibo.com/visitor/visitor?entry=miniblog&a=enter&url=https%3A%2F%2Fm.weibo.cn%2F&domain=.weibo.cn&sudaref=",
      {
        headers: { "User-Agent": UA_MOBILE },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  } catch {
    return "";
  }
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": UA_DESKTOP,
        ...(options.headers || {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok && !ct.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 从 m.weibo.cn 详情 JSON 提取视频信息（statuses/show 的 data 即 mblog 对象） */
function extractFromMWeibo(json) {
  const mblog = json?.data?.mblog || json?.data || null;
  if (!mblog) return null;
  const pageInfo = mblog.page_info || {};
  const media = pageInfo.media_info || {};
  const mediaUrl =
    pageInfo.media_url ||
    media.mp4_url ||
    media.mp4_hd_url ||
    media.mp4_sd_url ||
    media.hd_url ||
    media.ld_url ||
    media.origin_url;
  if (!mediaUrl) return null;
  return {
    title: (mblog.text || "").replace(/<[^>]+>/g, "").trim().slice(0, 120),
    cover: media.poster || pageInfo.page_pic?.url || "",
    author: mblog.user?.screen_name || "",
    avatar:
      mblog.user?.avatar_large ||
      mblog.user?.avatar_hd ||
      mblog.user?.profile_image_url ||
      "",
    time: mblog.created_at || "",
    url: mediaUrl,
  };
}

/** 从官方 tv/api/component 响应提取视频信息（带游客凭据） */
function extractFromComponent(json) {
  const data = json?.data?.Component_Play_Playinfo;
  if (!data || !data.urls) return null;
  const urls = Object.values(data.urls);
  if (!urls.length) return null;
  return {
    title: data.title || "",
    cover: data.cover_image || "",
    author: data.author || "",
    avatar: data.avatar || "",
    time: data.real_date || "",
    url: urls[0],
  };
}

async function weibo(url) {
  const id = extractId(url);
  if (!id) return null;

  // 游客凭据（自动获取，无需配置）
  const cookie = await getVisitorCookie();
  const uid = id.includes(":") ? id.split(":")[1] : id;

  // 1) m.weibo.cn 单条详情公开 JSON（游客可访问，直接给 page_info.media_url）
  const mJson = await fetchJson(`https://m.weibo.cn/statuses/show?id=${uid}`, {
    "User-Agent": UA_MOBILE,
    Cookie: cookie,
    Referer: "https://m.weibo.cn/",
  });
  const fromM = extractFromMWeibo(mJson);
  if (fromM && fromM.url) return fromM;

  // 2) 降级：官方 tv/api/component（同样带游客凭据）
  const cJson = await fetchJson(
    `https://weibo.com/tv/api/component?page=/tv/show/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Referer: `https://weibo.com/tv/show/${id}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA_DESKTOP,
      },
      body: `data=${encodeURIComponent(
        `{"Component_Play_Playinfo":{"oid":"${id}"}}`
      )}`,
    }
  );
  const fromC = extractFromComponent(cJson);
  if (fromC && fromC.url) return fromC;

  return null;
}

export const GET = createApiHandler(weibo);