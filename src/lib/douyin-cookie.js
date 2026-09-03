/**
 * 抖音匿名 ttwid 捕获 / 持久化 / 复用。
 *
 * 背景：抖音和 B 站一样，未登录访问会自动下发匿名 Cookie（ttwid，设备指纹）。
 * 带上一组稳定复用的 ttwid，抖音会认为请求来自「正常浏览的游客」，风控阈值放宽；
 * 且抖音二次握手机制要求「先拿 ttwid，再带 ttwid 请求数据」。
 *
 * 设计（与 bilibili-cookie.js 一致）：
 * - 首次请求从响应头 Set-Cookie 捕获 ttwid；
 * - 有 Turso 时持久化到 kv_store 表，后续所有请求复用同一组（稳定是关键，
 *   频繁更换 ttwid 反而像爬虫）；
 * - 未配置 Turso 时降级为「单次请求内捕获复用」，不阻塞主流程。
 */

import { createTursoClient } from "@/lib/turso-client";
import { logger } from "@/lib/api-utils";

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
    logger.warn(`[douyin-cookie] 数据库连接创建失败: ${e.message}`);
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
 * 从响应头 Set-Cookie 中提取抖音 ttwid（兼容 undici 的多 Set-Cookie 头）。
 * @param {Response} response
 * @returns {string} 形如 "ttwid=xxx" 的 Cookie 串，无则返回 ""
 */
export function extractDouyinTtwid(response) {
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
    logger.warn(`[douyin-cookie] 提取 ttwid 失败: ${e.message}`);
  }
  return "";
}

/**
 * 读取持久化的抖音 ttwid。
 * @returns {Promise<string>} 持久化的 ttwid Cookie 串，无则返回 ""
 */
export async function getDouyinTtwid() {
  try {
    const client = getClient();
    if (!client) return "";
    const ok = await ensureTable();
    if (!ok) return "";
    const { rows } = await client.execute({
      sql: "SELECT value FROM kv_store WHERE key = ?",
      args: ["douyin_ttwid"],
    });
    return rows[0]?.value || "";
  } catch (e) {
    logger.warn(`[douyin-cookie] 读取失败: ${e.message}`);
    return "";
  }
}

/**
 * 持久化抖音 ttwid（upsert）。
 * @param {string} ttwid 形如 "ttwid=xxx" 的 Cookie 串
 */
export async function saveDouyinTtwid(ttwid) {
  if (!ttwid) return;
  try {
    const client = getClient();
    if (!client) return;
    const ok = await ensureTable();
    if (!ok) return;
    await client.execute({
      sql: "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: ["douyin_ttwid", ttwid, new Date().toISOString()],
    });
    logger.log("[douyin-cookie] 已持久化 ttwid");
  } catch (e) {
    logger.warn(`[douyin-cookie] 写入失败: ${e.message}`);
  }
}