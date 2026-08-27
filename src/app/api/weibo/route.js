import { createApiHandler } from "@/lib/api-middleware";

export const runtime = "nodejs";

/**
 * 微博视频解析（游客模式，无需登录 Cookie）
 *
 * 背景：2026-08 起微博对无 Cookie 的服务端请求全部 302 到登录墙（passport.weibo.com），
 * 旧实现依赖环境变量 WEIBO_COOKIE，未配置时 component 接口拿不到数据 → 全量解析失败。
 *
 * 2026-08-27 修复：旧版「a=enter 一次性下发 Cookie」已失效（现在返回需要执行 JS 指纹的 HTML 页面）。
 * 新版访客流程（与新浪访客系统 JS 一致，weiboSpider 等开源爬虫同款）：
 *  1. POST /visitor/genvisitor 上报伪指纹 → 拿 tid；
 *  2. GET  /visitor/visitor?a=incarnate&t={tid}&w=2&c=100 → 拿 SUB/SUBP 访客 Cookie；
 *  3. 用访客 Cookie + X-Requested-With 请求 m.weibo.cn 公开 JSON（page_info.media_url 即视频直链）；
 *  4. 失败降级 → 访客 Cookie + 旧 tv/api/component。
 *
 * 游客 Cookie 运行时获取并模块级缓存（约 25 分钟），不读环境变量、无持久化。
 */

const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TIMEOUT_MS = 8000;

/** 访客 Cookie 模块级缓存（SUB 有效期较长，避免每次解析都跑两趟访客流程） */
let visitorCookieCache = "";
let visitorCookieExpireAt = 0;
const VISITOR_COOKIE_TTL_MS = 25 * 60 * 1000;

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

/**
 * 获取微博游客通行凭据（SUB/SUBP）。两段式：
 *  1) POST /visitor/genvisitor 上报伪指纹拿 tid；
 *  2) GET  /visitor/visitor?a=incarnate&t={tid}&w=2&c=100 拿 SUB。
 * 结果模块级缓存约 25 分钟。
 */
async function getVisitorCookie() {
  if (visitorCookieCache && Date.now() < visitorCookieExpireAt) {
    return visitorCookieCache;
  }
  try {
    // 1) genvisitor：上报伪设备指纹，换取 tid
    const fpBody =
      'cb=gen_callback&fp={"os":"1","browser":"Safari16","fonts":"undefined","screen":"*","plugins":""}';
    const res1 = await fetch("https://visitor.passport.weibo.cn/visitor/genvisitor", {
      method: "POST",
      headers: {
        "User-Agent": UA_MOBILE,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://m.weibo.cn/",
      },
      body: fpBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text1 = await res1.text();
    const tid = text1.match(/"tid":"([^"]+)"/)?.[1];
    if (!tid) return "";

    // 2) incarnate：tid 换取 SUB/SUBP 访客 Cookie
    const res2 = await fetch(
      `https://visitor.passport.weibo.cn/visitor/visitor?a=incarnate&t=${encodeURIComponent(
        tid
      )}&w=2&c=100&gc=&cb=cross_domain&from=weibo&_rand=${Math.random()}`,
      {
        headers: { "User-Agent": UA_MOBILE, Referer: "https://m.weibo.cn/" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    const text2 = await res2.text();
    const sub = text2.match(/"sub":"([^"]+)"/)?.[1];
    const subp = text2.match(/"subp":"([^"]+)"/)?.[1];
    if (!sub) return "";

    const cookie = `SUB=${sub}${subp ? `; SUBP=${subp}` : ""}`;
    visitorCookieCache = cookie;
    visitorCookieExpireAt = Date.now() + VISITOR_COOKIE_TTL_MS;
    return cookie;
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

/** 规范化微博 CDN 链接（"//xxx" → "https://xxx"） */
function normalizeUrl(u) {
  if (!u) return "";
  return u.startsWith("//") ? `https:${u}` : u;
}

/** 微博图 URL 统一放大尺寸（缩略图 → 原图） */
function normalizeImageUrl(u) {
  const url = normalizeUrl(u);
  if (!url) return "";
  // sinaimg 的尺寸标识：thumb150/bmiddle/orj360 替换为 large（原图）
  return url
    .replace(/\/thumb150\//, "/large/")
    .replace(/\/bmiddle\//, "/large/")
    .replace(/\/orj360\//, "/large/");
}

/** 从 mblog 对象提取图片列表（pics[].large.url，兼容字符串项） */
function extractImagesFromMblog(mblog) {
  if (!Array.isArray(mblog?.pics)) return [];
  const images = [];
  for (const p of mblog.pics) {
    const raw =
      (typeof p === "string" ? p : "") ||
      p?.large?.url ||
      p?.url ||
      "";
    const url = normalizeImageUrl(raw);
    if (url) images.push(url);
  }
  return images;
}

/**
 * 从 m.weibo.cn 详情 JSON 提取微博信息（statuses/show 的 data 即 mblog 对象）。
 * 按媒体类型返回：
 *  - 有视频直链 → type: video（url/cover）
 *  - 无视频但有图片 → type: image（images 图集 + url/cover 指向第一张）
 *  - 仅有文字 → type: text（无媒体字段，前端展示提示）
 */
function extractFromMWeibo(json) {
  const mblog = json?.data?.mblog || json?.data || null;
  if (!mblog) return null;
  const title = (mblog.text || "").replace(/<[^>]+>/g, "").trim().slice(0, 120);
  const author = mblog.user?.screen_name || "";
  const avatar = normalizeUrl(
    mblog.user?.avatar_large ||
      mblog.user?.avatar_hd ||
      mblog.user?.profile_image_url ||
      ""
  );
  const time = mblog.created_at || "";
  const base = { title, author, avatar, time };

  // 1) 视频：page_info.media_info 多级降级取直链
  const pageInfo = mblog.page_info || {};
  const media = pageInfo.media_info || {};
  const mediaUrl =
    pageInfo.media_url ||
    media.stream_url_hd ||
    media.stream_url ||
    media.mp4_hd_url ||
    media.mp4_720p_mp4 ||
    media.mp4_hd_mp4 ||
    media.mp4_ld_mp4 ||
    media.mp4_url ||
    media.mp4_sd_url ||
    media.hd_url ||
    media.ld_url ||
    media.origin_url;
  if (mediaUrl) {
    return {
      ...base,
      cover: normalizeUrl(media.poster || pageInfo.page_pic?.url || ""),
      url: normalizeUrl(mediaUrl),
      type: "video",
    };
  }

  // 2) 图片：mblog.pics 图集
  const images = extractImagesFromMblog(mblog);
  if (images.length > 0) {
    return {
      ...base,
      cover: images[0],
      url: images[0],
      images,
      type: "image",
    };
  }

  // 3) 纯文字：无媒体，仅返回元数据
  return { ...base, type: "text" };
}

/** 按清晰度优先级从 component urls 里选直链 */
const QUALITY_ORDER = [
  "超清 2K",
  "超清 1080P",
  "高清 1080P",
  "蓝光",
  "高清 720P",
  "标清 480P",
  "标清",
  "流畅",
];

/** 从官方 tv/api/component 响应提取视频信息（带游客凭据）；同时返回 mid 供二次补全元数据 */
function extractFromComponent(json) {
  const data = json?.data?.Component_Play_Playinfo;
  if (!data || !data.urls) return null;
  const entries = Object.entries(data.urls);
  if (!entries.length) return null;
  let picked = entries[0];
  for (const q of QUALITY_ORDER) {
    const hit = entries.find(([label]) => label.includes(q));
    if (hit) {
      picked = hit;
      break;
    }
  }
  const url = normalizeUrl(picked[1]);
  if (!url) return null;
  return {
    title: (data.title || "").trim(),
    cover: normalizeUrl(data.cover_image || ""),
    author: data.author || data.nickname || "",
    avatar: normalizeUrl(data.avatar || ""),
    time: data.real_date ? new Date(Number(data.real_date) * 1000).toISOString() : "",
    url,
    mid: data.mid ? String(data.mid) : "",
    type: "video",
  };
}

async function weibo(url) {
  const id = extractId(url);
  if (!id) return null;

  // 游客凭据（自动获取，无需配置）
  const cookie = await getVisitorCookie();

  // 1) 官方 tv/api/component（oid=fid）：唯一能把 fid（1034:xxx）映射到微博的公开接口，
  //    返回多清晰度直链 + mid（真实 status id）。
  const cJson = await fetchJson(
    `https://weibo.com/tv/api/component?page=/tv/show/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Referer: `https://weibo.com/tv/show/${id}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA_DESKTOP,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: `data=${encodeURIComponent(
        `{"Component_Play_Playinfo":{"oid":"${id}"}}`
      )}`,
    }
  );
  const fromC = extractFromComponent(cJson);
  if (fromC && fromC.url) {
    // 2) 用 mid 再查 m.weibo.cn 详情，补全标题（正文）、头像、时间等元数据
    let meta = fromC;
    if (fromC.mid) {
      const mJson = await fetchJson(
        `https://m.weibo.cn/statuses/show?id=${encodeURIComponent(fromC.mid)}`,
        {
          headers: {
            "User-Agent": UA_MOBILE,
            Cookie: cookie,
            Referer: "https://m.weibo.cn/",
            "X-Requested-With": "XMLHttpRequest",
            "MWeibo-Pwa": "1",
            Accept: "application/json, text/plain, */*",
          },
        }
      );
      const fromM = extractFromMWeibo(mJson);
      if (fromM) {
        // 视频场景：url/type 以 component 结果为准（fromM 可能因无视频被归类为 image/text）
        meta = { ...fromC, ...fromM, url: fromC.url, type: "video" };
      }
    }
    // 剔除 mid 字段（避免冗余，且不在响应中暴露微博内部 id）
    const data = { ...meta };
    delete data.mid;
    return { code: 200, msg: "解析成功", data };
  }

  // 3) 降级：m.weibo.cn 单条详情（id 可能本身是 status mid，如 layerid / weibo.com/{uid}/{mid} 链接）
  //    注意：必须带 X-Requested-With 等 H5 头，否则返回 HTML 错误页而非 JSON
  const uid = id.includes(":") ? id.split(":")[1] : id;
  const mJson = await fetchJson(`https://m.weibo.cn/statuses/show?id=${encodeURIComponent(uid)}`, {
    headers: {
      "User-Agent": UA_MOBILE,
      Cookie: cookie,
      Referer: "https://m.weibo.cn/",
      "X-Requested-With": "XMLHttpRequest",
      "MWeibo-Pwa": "1",
      Accept: "application/json, text/plain, */*",
    },
  });
  const fromM = extractFromMWeibo(mJson);
  // 视频 / 图片 / 纯文字微博都算解析成功（data.type 区分媒体类型），
  // 只有完全拿不到内容时才走 null → 外层统一报「解析失败」
  if (fromM) {
    return { code: 200, msg: "解析成功", data: fromM };
  }

  return null;
}

export const GET = createApiHandler(weibo);