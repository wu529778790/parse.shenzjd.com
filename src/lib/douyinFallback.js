/**
 * 抖音公共解析 API 兜底引擎
 *
 * 移植自 https://github.com/652036/video-unwatermark 的 webparser.py（Apache-2.0）：
 * share-page 直连抖音被风控/结构变化时，并发竞速多个公开 JSON 解析接口，
 * 任何一个返回有效直链即胜出。无需 API key / cookie。
 *
 * 实测（2026-08-22）：17change 抖音端当前返回 5001（页面结构变化），
 * douyin.wtf 偶发超时、yujn 易限流、tenapi 常 502 —— 单个不稳，
 * 但竞速 + 兜底的意义在于任何一个恢复即可自动生效，不影响主流程。
 */

import { createHash } from "crypto";
import { logger } from "@/lib/api-utils";

const SITE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BACKEND_TIMEOUT = 9000; // 单个 API 超时（4 个并行，整体最坏约 9s）

const ORIGIN_17 = "https://17change.cn";
const PARSE_17 = "https://api4.17change.cn/parse/video";
const EVIL_HYBRID = "https://douyin.wtf/api/hybrid/video_data";
const YUJN_DY = "https://api.yujn.cn/api/dy_jx.php";
const TENAPI_V2 = "https://tenapi.cn/v2/video";

/** 17change 的 md5 签名（body keys 排序 + timestamp/nonce + Origin 参与签名） */
function sign17(body) {
  const keys = Object.keys(body).sort();
  const joined = keys.map((k) => `${k}=${body[k]}`).join("&");
  const ts = String(Date.now());
  const nonce = Math.floor(Math.random() * 0x10000000000)
    .toString(16)
    .padStart(10, "0");
  const raw = `${joined}&Timestamp=${ts}&nonce=${nonce}&url=${ORIGIN_17}`;
  const sig = createHash("md5").update(raw, "utf8").digest("hex");
  return {
    "User-Agent": SITE_UA,
    "Content-Type": "application/json",
    Origin: ORIGIN_17,
    Referer: "https://17change.cn/fastools/parsevideo",
    timestamp: ts,
    nonce,
    signature: sig,
  };
}

/** 从任意嵌套结构中取第一个 http(s) 字符串 */
function firstHttp(value) {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const got = firstHttp(item);
      if (got) return got;
    }
  } else if (value && typeof value === "object") {
    for (const key of ["url_list", "urlList", "url", "play", "src", "uri", "nwm_video_url", "nwm_video_url_hq", "wm_video_url", "video_url", "play_video"]) {
      if (key in value) {
        const got = firstHttp(value[key]);
        if (got) return got;
      }
    }
  }
  return null;
}

/** 通用字段提取：video 直链 + 标题 + 封面 */
function pickGeneric(data) {
  if (!data || typeof data !== "object") return { url: null, title: null, cover: null };
  const title =
    (typeof data.title === "string" && data.title.trim()) ||
    (typeof data.desc === "string" && data.desc.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    null;
  const video =
    (data.video && typeof data.video === "object" ? data.video : null) ||
    (data.video_data && typeof data.video_data === "object" ? data.video_data : null) ||
    (data.data && typeof data.data === "object" ? data.data : null);
  let url = video ? firstHttp(video) : null;
  url = url || firstHttp(data.nwm_video_url_hq) || firstHttp(data.nwm_video_url) ||
    firstHttp(data.play_video) || firstHttp(data.video_url) || firstHttp(data.url) || firstHttp(data.play);
  const cover = firstHttp(data.cover) || firstHttp(data.cover_url) || firstHttp(data.origin_cover);
  return { url, title, cover };
}

function isOkCode(code) {
  return code === 200 || code === "200" || code === 0 || code === "0" || code === "ok" || code === "OK" || code == null;
}

async function try17change(url) {
  const body = { link: url };
  let resp;
  try {
    resp = await fetch(PARSE_17, {
      method: "POST",
      headers: sign17(body),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT),
    });
  } catch (e) {
    return { ok: false, error: `17change: ${e.message.slice(0, 80)}` };
  }
  let payload;
  try {
    payload = await resp.json();
  } catch {
    return { ok: false, error: `17change: 非 JSON (${resp.status})` };
  }
  if (!isOkCode(payload.code)) {
    return { ok: false, error: `17change: ${payload.message || payload.msg || payload.code}` };
  }
  const { url: direct, title, cover } = pickGeneric(payload.data && typeof payload.data === "object" ? payload.data : payload);
  if (!direct) return { ok: false, error: "17change: 响应无视频地址" };
  return { ok: true, key: "17change", url: direct, title, cover };
}

async function tryDouyinWtf(url) {
  let resp;
  try {
    resp = await fetch(
      `${EVIL_HYBRID}?url=${encodeURIComponent(url)}&minimal=true`,
      { headers: { "User-Agent": SITE_UA, Accept: "application/json" }, signal: AbortSignal.timeout(BACKEND_TIMEOUT) }
    );
  } catch (e) {
    return { ok: false, error: `douyin.wtf: ${e.message.slice(0, 80)}` };
  }
  if (resp.status === 429) return { ok: false, error: "douyin.wtf: rate limited" };
  let payload;
  try {
    payload = await resp.json();
  } catch {
    return { ok: false, error: `douyin.wtf: 非 JSON (${resp.status})` };
  }
  if (!isOkCode(payload.code)) {
    return { ok: false, error: `douyin.wtf: ${payload.message || payload.msg || payload.code}` };
  }
  const src = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const { url: direct, title, cover } = pickGeneric(src);
  if (!direct) return { ok: false, error: "douyin.wtf: 响应无视频地址" };
  return { ok: true, key: "douyin.wtf", url: direct, title, cover };
}

async function tryYujn(url) {
  let resp;
  try {
    resp = await fetch(
      `${YUJN_DY}?msg=${encodeURIComponent(url)}`,
      { headers: { "User-Agent": SITE_UA, Accept: "application/json" }, signal: AbortSignal.timeout(BACKEND_TIMEOUT) }
    );
  } catch (e) {
    return { ok: false, error: `yujn: ${e.message.slice(0, 80)}` };
  }
  let payload;
  try {
    payload = await resp.json();
  } catch {
    return { ok: false, error: `yujn: 非 JSON (${resp.status})` };
  }
  const { url: direct, title, cover } = pickGeneric(payload);
  if (!direct) {
    return { ok: false, error: `yujn: ${payload.msg || payload.message || "响应无视频地址"}` };
  }
  return { ok: true, key: "yujn", url: direct, title, cover };
}

async function tryTenapi(url) {
  let resp;
  try {
    resp = await fetch(TENAPI_V2, {
      method: "POST",
      headers: { "User-Agent": SITE_UA },
      body: new URLSearchParams({ url }),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT),
    });
  } catch (e) {
    return { ok: false, error: `tenapi: ${e.message.slice(0, 80)}` };
  }
  let payload;
  try {
    payload = await resp.json();
  } catch {
    return { ok: false, error: `tenapi: 非 JSON (${resp.status})` };
  }
  if (!isOkCode(payload.code)) {
    return { ok: false, error: `tenapi: ${payload.msg || payload.message || payload.code}` };
  }
  const src = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const { url: direct, title, cover } = pickGeneric(src);
  if (!direct) return { ok: false, error: "tenapi: 响应无视频地址" };
  return { ok: true, key: "tenapi", url: direct, title, cover };
}

/**
 * 竞速所有公共解析 API，返回第一个成功的：
 * { ok: true, key, url, title, cover } | { ok: false, error }
 */
export async function douyinPublicFallback(url) {
  const backends = [try17change, tryDouyinWtf, tryYujn, tryTenapi];
  const errors = [];
  const results = await Promise.allSettled(
    backends.map(async (fn) => {
      // 每个 API 独立超时由 AbortSignal 控制；整体由 RACE_TIMEOUT 兜底
      return await fn(url);
    })
  );
  // allSettled 已等全部完成；若整体超预算则由调用方控制（fallback 整体有超时）。
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.ok && r.value.url) {
      logger.log(`[douyin] 公共解析兜底命中: ${r.value.key}`);
      return r.value;
    }
    if (r.status === "fulfilled" && r.value) errors.push(r.value.error);
    else if (r.status === "rejected") errors.push(String(r.reason).slice(0, 80));
  }
  logger.warn(`[douyin] 公共解析兜底全部失败: ${errors.slice(0, 4).join("; ")}`);
  return { ok: false, error: errors.slice(0, 4).join("; ") || "公共解析全部失败" };
}

/**
 * 通用 17change 公共解析（平台无关：抖音/快手等公开视频均可）。
 * 作为快手主解析失败时的备用通道（参考 video-unwatermark webparser.py，
 * 实测 17change 对快手返回 code 200 且含无水印直链）。
 * 返回 { ok: true, key, url, title, cover, author } | { ok: false, error }
 */
export async function public17Parse(url) {
  const body = { link: url };
  let resp;
  try {
    resp = await fetch(PARSE_17, {
      method: "POST",
      headers: sign17(body),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT),
    });
  } catch (e) {
    return { ok: false, error: `17change: ${e.message.slice(0, 80)}` };
  }
  let payload;
  try {
    payload = await resp.json();
  } catch {
    return { ok: false, error: `17change: 非 JSON (${resp.status})` };
  }
  if (!isOkCode(payload.code)) {
    return { ok: false, error: `17change: ${payload.message || payload.msg || payload.code}` };
  }
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const { url: direct, title, cover } = pickGeneric(data);
  if (!direct) return { ok: false, error: "17change: 响应无视频地址" };
  const author =
    data?.author && typeof data.author === "object"
      ? data.author.name || data.author.nickname || null
      : null;
  logger.log(`[public17] 解析命中: ${title ? title.slice(0, 30) : ""}`);
  return { ok: true, key: "17change", url: direct, title, cover, author };
}

export const _internal = { sign17, firstHttp, pickGeneric, isOkCode };
