/**
 * 解析行为分析 —— 把每次成功解析记录到 Turso（libsql）数据库，
 * 用于按平台/按天统计用户使用情况。
 *
 * 设计原则：
 * - 惰性连接：未配置 TURSO_DB_URL/TURSO_AUTH_TOKEN 时全部静默跳过，不影响主流程；
 * - 记录不阻塞响应（调用方 fire-and-forget，本模块内部已容错）；
 * - IP 匿名化存储（SHA-256 哈希），不落明文 IP。
 */

import { createClient } from "@libsql/client";
import { logger } from "@/lib/api-utils";

let db = null;
let tableReady = null;

function getClient() {
  if (db) return db;
  const url = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) return null;
  try {
    db = createClient({ url, authToken: token });
  } catch (e) {
    logger.warn(`[analytics] 数据库连接创建失败: ${e.message}`);
    return null;
  }
  return db;
}

/** 幂等建表（并发安全：只执行一次） */
async function ensureTable() {
  if (tableReady) return tableReady;
  const client = getClient();
  if (!client) {
    tableReady = Promise.resolve(false);
    return tableReady;
  }
  tableReady = (async () => {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS parse_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        video_url TEXT NOT NULL,
        ip_hash TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pe_platform_date ON parse_events(platform, created_at)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pe_date ON parse_events(created_at)"
    );
    logger.log("[analytics] 数据表就绪");
    return true;
  })();
  tableReady.catch(() => {
    tableReady = null; // 建表失败允许下次重试
  });
  return tableReady;
}

/** IP 匿名化：SHA-256(固定盐 + ip)，不可逆，仅用于估算独立访客 */
async function hashIp(ip) {
  if (!ip) return "";
  try {
    const data = new TextEncoder().encode(`parse-analytics:${ip}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/**
 * 记录一次成功解析。所有异常静默（记录失败不影响解析主流程）。
 * @param {{ platform?: string, url: string, ip?: string }} event
 */
export async function recordParse({ platform = "", url = "", ip = "" } = {}) {
  try {
    const client = getClient();
    if (!client) return;
    const ok = await ensureTable();
    if (!ok) return;
    const ipHash = await hashIp(ip);
    await client.execute({
      sql: "INSERT INTO parse_events (platform, video_url, ip_hash, created_at) VALUES (?, ?, ?, ?)",
      args: [platform, url, ipHash, new Date().toISOString()],
    });
  } catch (e) {
    logger.warn(`[analytics] 记录失败: ${e.message}`);
  }
}

/**
 * 查询聚合统计（供 /api/stats 使用）。
 * @returns {Promise<null | { totals: object, byPlatform: object[], byDay: object[] }>}
 */
export async function queryStats() {
  const client = getClient();
  if (!client) return null;
  const ok = await ensureTable();
  if (!ok) return null;
  try {
    const [byPlatform, byDay, totals] = await Promise.all([
      client.execute(
        "SELECT platform, COUNT(*) AS cnt FROM parse_events GROUP BY platform ORDER BY cnt DESC"
      ),
      client.execute(
        "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS cnt FROM parse_events GROUP BY day ORDER BY day DESC LIMIT 14"
      ),
      client.execute(
        "SELECT COUNT(*) AS total, COUNT(DISTINCT ip_hash) AS users, COUNT(DISTINCT video_url) AS unique_links FROM parse_events"
      ),
    ]);
    return {
      totals: totals.rows[0],
      byPlatform: byPlatform.rows,
      byDay: byDay.rows,
    };
  } catch (e) {
    logger.warn(`[analytics] 查询统计失败: ${e.message}`);
    return null;
  }
}
