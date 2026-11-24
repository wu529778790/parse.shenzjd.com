/**
 * B 站匿名 Cookie 捕获 / 持久化 / 复用。
 *
 * 背景：B 站对「无任何 Cookie 的裸请求」（海外出口尤其明显）风控最严，
 * 会返回 code=-412 或 HTML 拦截页。但未登录访问 B 站时，B 站会自动下发
 * 一组匿名 Cookie（buvid3 / buvid4 / b_nut 等设备指纹），带上一组稳定复用的
 * 匿名 Cookie 后，B 站会认为请求来自「正常浏览的游客」，风控阈值大幅放宽。
 *
 * 设计（借鉴抖音 ttwid 模式）：
 * - 首次请求从响应头 Set-Cookie 捕获匿名 Cookie；
 * - 有 Turso 时持久化到 kv_store 表，后续所有请求复用同一组（稳定是关键，
 *   B 站风控会看 buvid3 是否长期一致，频繁更换反而像爬虫）；
 * - 未配置 Turso 时降级为「单次请求内捕获复用」，不阻塞主流程。
 */

import { createTursoClient } from "@/lib/turso-client";
import { logger } from "@/lib/api-utils";
import { biliFetch, BILIBILI_USER_AGENT } from "@/lib/bilibili-fetch";

// 需要捕获并复用的匿名 Cookie 键（B 站设备指纹 / 游客标识）
const ANON_COOKIE_KEYS = ["buvid3", "buvid4", "b_nut", "buvid", "b_lsid"];
const ANON_COOKIE_NAMES = new Set(ANON_COOKIE_KEYS);

let db = null;
let tableReady = null;

function getClient() {
  if (db) return db;
  const url = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) return null;
  try {
    db = createTursoClient({ url, authToken: token });
  } catch (e) {
    logger.warn(`[bilibili-cookie] 数据库连接创建失败: ${e.message}`);
    return null;
  }
  return db;
}

/** 幂等建表：kv_store 通用 key-value 表（供匿名 Cookie 等持久化使用） */
async function ensureTable() {
  if (tableReady) return tableReady;
  const client = getClient();
  if (!client) {
    tableReady = Promise.resolve(false);
    return tableReady;
  }
  tableReady = (async () => {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    return true;
  })();
  tableReady.catch(() => {
    tableReady = null; // 建表失败允许下次重试
  });
  return tableReady;
}

/**
 * 从响应头 Set-Cookie 中提取 B 站匿名 Cookie 字符串。
 * 兼容 undici 的多 Set-Cookie 头（getSetCookie / entries 两种取法）。
 * @param {Response} response
 * @returns {string} 形如 "buvid3=xxx; buvid4=xxx; b_nut=xxx" 的 Cookie 串，无则返回 ""
 */
export function extractBilibiliAnonCookie(response) {
  try {
    const setCookies = [];
    if (typeof response.headers.getSetCookie === "function") {
      setCookies.push(...response.headers.getSetCookie());
    } else {
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === "set-cookie") setCookies.push(value);
      }
    }
    const parts = [];
    for (const sc of setCookies) {
      const name = sc.split("=")[0].trim();
      if (ANON_COOKIE_NAMES.has(name)) {
        const value = sc.split(";")[0].trim();
        parts.push(value);
      }
    }
    return parts.join("; ");
  } catch (e) {
    logger.warn(`[bilibili-cookie] 提取匿名 Cookie 失败: ${e.message}`);
    return "";
  }
}

/**
 * 向 B站 spi 接口要一组真实匿名设备指纹（buvid3 / buvid4）。
 *
 * 为什么需要它（2026-11-24 线上核查）：`kv_store` 里**从来没有**过
 * `bilibili_anon_cookie` 这条记录——本模块的捕获依赖响应头 Set-Cookie，而
 * B站 API 在机房出口上基本不下发，被 412 拦时更不会下发，于是进程重启后
 * 一直落到「本地伪造 buvid3」兜底。伪造的 buvid3 实测可用（api 带任一
 * buvid3 即 200、裸请求必 412），但换成 spi 下发的真指纹更稳，且能落库让
 * 所有实例复用同一台"设备"。
 *
 * spi 接口本身不受风控（实测 200），走与解析相同的中继出口。
 * @returns {Promise<string>} 形如 "buvid3=xxx; buvid4=yyy"；拿不到返回 ""
 */
export async function fetchAnonCookieFromSpi() {
  try {
    const response = await biliFetch(
      "https://api.bilibili.com/x/frontend/finger/spi",
      {
        headers: {
          "User-Agent": BILIBILI_USER_AGENT,
          Referer: "https://www.bilibili.com/",
        },
        // 冷启动才走一次，超时短一点，别把首屏解析拖住
        signal: AbortSignal.timeout(4000),
      }
    );
    const json = await response.json();
    const buvid3 = json?.data?.b_3;
    const buvid4 = json?.data?.b_4;
    if (!buvid3) return "";
    return buvid4 ? `buvid3=${buvid3}; buvid4=${buvid4}` : `buvid3=${buvid3}`;
  } catch (e) {
    logger.warn(`[bilibili-cookie] spi 获取匿名指纹失败: ${e.message}`);
    return "";
  }
}

/**
 * 读取持久化的 B 站匿名 Cookie。
 * @returns {Promise<string>} 持久化的 Cookie 串，无则返回 ""
 */
export async function getBiliAnonCookie() {
  try {
    const client = getClient();
    if (!client) return "";
    const ok = await ensureTable();
    if (!ok) return "";
    const { rows } = await client.execute({
      sql: "SELECT value FROM kv_store WHERE key = ?",
      args: ["bilibili_anon_cookie"],
    });
    return rows[0]?.value || "";
  } catch (e) {
    logger.warn(`[bilibili-cookie] 读取失败: ${e.message}`);
    return "";
  }
}

/**
 * 持久化 B 站匿名 Cookie（upsert）。
 * @param {string} cookie 形如 "buvid3=xxx; buvid4=xxx" 的 Cookie 串
 */
export async function saveBiliAnonCookie(cookie) {
  if (!cookie) return;
  try {
    const client = getClient();
    if (!client) return;
    const ok = await ensureTable();
    if (!ok) return;
    await client.execute({
      sql: "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: ["bilibili_anon_cookie", cookie, new Date().toISOString()],
    });
    logger.log("[bilibili-cookie] 已持久化匿名 Cookie");
  } catch (e) {
    logger.warn(`[bilibili-cookie] 写入失败: ${e.message}`);
  }
}