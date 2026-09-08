/**
 * B 站 WBI 签名（w_rid / wts）。
 *
 * 背景：B站 Web API（如 /x/web-interface/view）从 2023 年起要求请求携带
 * WBI 签名参数（wts + w_rid），缺失或校验失败会被风控拦截（code=-412）。
 * 2026-09 线上日志显示所有 B站解析连续数日 100% 被 -412，补上签名是
 * 恢复解析的前提。
 *
 * 算法：
 * 1. 请求 /x/web-interface/nav 拿 wbi_img.img_url / sub_url，文件名即
 *    img_key / sub_key（每天轮换一次）；
 * 2. 用固定重排表把 img_key+sub_key 重排后取前 32 位得到 mixin_key；
 * 3. 业务参数 + wts（秒级时间戳）按键名字典序排序、URL 编码后拼串，
 *    末尾拼 mixin_key 做 MD5 得到 w_rid。
 *
 * 密钥策略：
 * - 进程内存缓存 12 小时（官方密钥每日轮换，12h 内有效）；
 * - 有 Turso 时持久化到 kv_store（key=bilibili_wbi_keys），实例重启/冷启动
 *   后立即恢复，避免冷启动期间签名不可用；
 * - nav 接口请求失败时降级使用过期密钥（旧密钥签名有时也能过），彻底拿不到
 *   密钥则返回 null，调用方回退为不带签名的裸请求。
 */

import { createHash } from "node:crypto";
import { createTursoClient } from "@/lib/turso-client";
import { logger } from "@/lib/api-utils";
import { biliFetch, BILIBILI_USER_AGENT } from "@/lib/bilibili-fetch";

// 密钥缓存有效期：官方每日轮换，取 12h 保守值
const WBI_KEY_TTL_MS = 12 * 60 * 60 * 1000;
// Turso kv_store 中的存储键
const KV_KEY = "bilibili_wbi_keys";

// WBI 混淆重排表（B站前端 JS 固定值）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

// 进程内密钥缓存
let wbiKeyCache = null; // { imgKey, subKey, fetchedAt: number }
let refreshing = null; // 并发去重：同一时刻只允许一次密钥刷新

function md5(text) {
  return createHash("md5").update(text).digest("hex");
}

/** img_key+sub_key 按混淆表重排后截取前 32 位 */
function getMixinKey(imgKey, subKey) {
  const orig = imgKey + subKey;
  let str = "";
  for (const i of MIXIN_KEY_ENC_TAB) {
    if (i < orig.length) str += orig[i];
  }
  return str.slice(0, 32);
}

/**
 * 生成带 WBI 签名的查询串。
 * @param {Object} params 业务参数
 * @param {string} mixinKey
 * @returns {string} 形如 "bvid=xxx&wts=...&w_rid=..." 的查询串
 */
function signQuery(params, mixinKey) {
  const wts = Math.floor(Date.now() / 1000);
  const merged = { ...params, wts };
  // 按键名字典序排序；value 移除特殊字符（B站前端同款清洗）后 URL 编码
  const query = Object.keys(merged)
    .sort()
    .map((key) => {
      const value = String(merged[key]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  const wRid = md5(query + mixinKey);
  return `${query}&w_rid=${wRid}`;
}

// ---------- Turso 持久化（与 bilibili-cookie.js 同一 kv_store 表） ----------

let db = null;
function getClient() {
  if (db) return db;
  const url = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) return null;
  try {
    db = createTursoClient({ url, authToken: token });
  } catch (e) {
    logger.warn(`[bilibili-wbi] 数据库连接创建失败: ${e.message}`);
    return null;
  }
  return db;
}

async function loadKeysFromDb() {
  try {
    const client = getClient();
    if (!client) return null;
    const { rows } = await client.execute({
      sql: "SELECT value FROM kv_store WHERE key = ?",
      args: [KV_KEY],
    });
    if (!rows[0]?.value) return null;
    const parsed = JSON.parse(rows[0].value);
    if (parsed?.imgKey && parsed?.subKey) return parsed;
    return null;
  } catch {
    // kv_store 表可能尚未创建（匿名 Cookie 模块会建表），静默降级
    return null;
  }
}

async function saveKeysToDb(keys) {
  try {
    const client = getClient();
    if (!client) return;
    await client.execute({
      sql: "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: [KV_KEY, JSON.stringify(keys), new Date().toISOString()],
    });
  } catch (e) {
    logger.warn(`[bilibili-wbi] 密钥持久化失败: ${e.message}`);
  }
}

// ---------- 密钥获取 ----------

/** 请求 nav 接口拉取最新密钥，失败返回 null */
async function fetchKeysFromNav() {
  try {
    const response = await biliFetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent": BILIBILI_USER_AGENT,
        Referer: "https://www.bilibili.com/",
        Origin: "https://www.bilibili.com",
        Accept: "application/json, text/plain, */*",
      },
      // nav 风控较宽松，超时兜底 3s，避免拖慢解析主流程
      signal: AbortSignal.timeout(3000),
    });
    const json = await response.json();
    const img = json?.data?.wbi_img;
    if (!img?.img_url || !img?.sub_url) return null;
    // 文件名即密钥：https://i0.hdslb.com/bfs/wbi/<img_key>.png
    const imgKey = img.img_url.split("/").pop().replace(/\.[a-zA-Z]+$/, "");
    const subKey = img.sub_url.split("/").pop().replace(/\.[a-zA-Z]+$/, "");
    if (!imgKey || !subKey) return null;
    return { imgKey, subKey, fetchedAt: Date.now() };
  } catch (e) {
    logger.warn(`[bilibili-wbi] nav 接口获取密钥失败: ${e.message}`);
    return null;
  }
}

/**
 * 获取可用的 WBI 密钥（含 mixin_key 生成）。
 * 优先级：内存缓存（未过期）> nav 刷新 > DB 持久化（含过期的，兜底）。
 * @returns {Promise<{imgKey: string, subKey: string, mixinKey: string}|null>}
 */
export async function getWbiKeys() {
  // 1. 内存缓存未过期，直接用
  if (wbiKeyCache && Date.now() - wbiKeyCache.fetchedAt < WBI_KEY_TTL_MS) {
    return { ...wbiKeyCache, mixinKey: getMixinKey(wbiKeyCache.imgKey, wbiKeyCache.subKey) };
  }

  // 2. 并发去重刷新
  if (!refreshing) {
    refreshing = (async () => {
      const fresh = await fetchKeysFromNav();
      if (fresh) {
        wbiKeyCache = fresh;
        saveKeysToDb(fresh); // fire-and-forget
        return true;
      }
      return false;
    })();
    try {
      await refreshing;
    } finally {
      refreshing = null;
    }
  } else {
    await refreshing;
  }

  if (wbiKeyCache) {
    return { ...wbiKeyCache, mixinKey: getMixinKey(wbiKeyCache.imgKey, wbiKeyCache.subKey) };
  }

  // 3. nav 失败（如 IP 被临时拦截）：读 DB 兜底，过期密钥签名有时也能通过
  const persisted = await loadKeysFromDb();
  if (persisted) {
    return {
      ...persisted,
      mixinKey: getMixinKey(persisted.imgKey, persisted.subKey),
    };
  }
  return null;
}

/**
 * 生成 WBI 签名查询串。
 * @param {Object} params 业务参数（如 { bvid: "BVxxx" }）
 * @returns {Promise<string|null>} 已签名的查询串；拿不到密钥时返回 null
 */
export async function signWbiParams(params) {
  const keys = await getWbiKeys();
  if (!keys) return null;
  return signQuery(params, keys.mixinKey);
}
