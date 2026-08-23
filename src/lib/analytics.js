/**
 * 解析行为分析 —— 把每次成功解析记录到 Turso（libsql）数据库，
 * 用于按平台/按天统计用户使用情况。
 *
 * 设计原则：
 * - 惰性连接：未配置 TURSO_DB_URL/TURSO_AUTH_TOKEN 时全部静默跳过，不影响主流程；
 * - 记录不阻塞响应（调用方 fire-and-forget，本模块内部已容错）；
 * - IP 匿名化存储（SHA-256 哈希），不落明文 IP。
 */

// 自实现 Turso HTTP 客户端（见 turso-client.js 说明）：零第三方依赖，
// 避免 Next.js standalone tracing 与 CF workerd 打包的解析不一致。
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
    logger.warn(`[analytics] 数据库连接创建失败: ${e.message}`);
    return null;
  }
  return db;
}

/** 幂等建表（并发安全：只执行一次），含旧表迁移（补 status/reason 列） */
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
        status TEXT NOT NULL DEFAULT 'success',
        reason TEXT,
        created_at TEXT NOT NULL
      )
    `);
    // 迁移：旧表无 status/reason 列时补列（重复列错误忽略）
    await ensureColumn(
      client,
      "status TEXT NOT NULL DEFAULT 'success'"
    );
    await ensureColumn(client, "reason TEXT");
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pe_platform_date ON parse_events(platform, created_at)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pe_date ON parse_events(created_at)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pe_status ON parse_events(status)"
    );
    logger.log("[analytics] 数据表就绪");
    return true;
  })();
  tableReady.catch(() => {
    tableReady = null; // 建表失败允许下次重试
  });
  return tableReady;
}

/** 为 parse_events 补列（SQLite 的 ADD COLUMN；重复列错误忽略） */
async function ensureColumn(client, ddl) {
  try {
    await client.execute(`ALTER TABLE parse_events ADD COLUMN ${ddl}`);
  } catch (e) {
    if (!/duplicate column|already exists/i.test(e.message || "")) throw e;
  }
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
 * 记录一次解析事件（成功或失败）。所有异常静默（记录失败不影响解析主流程）。
 * @param {{ platform?: string, url: string, ip?: string, status?: 'success'|'failed', reason?: string }} event
 */
export async function recordParse({
  platform = "",
  url = "",
  ip = "",
  status = "success",
  reason = "",
} = {}) {
  try {
    const client = getClient();
    if (!client) return;
    const ok = await ensureTable();
    if (!ok) return;
    const ipHash = await hashIp(ip);
    await client.execute({
      sql: "INSERT INTO parse_events (platform, video_url, ip_hash, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [platform, url, ipHash, status, reason.slice(0, 200), new Date().toISOString()],
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
        `SELECT platform,
                COUNT(*) AS total,
                SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM parse_events GROUP BY platform ORDER BY total DESC`
      ),
      client.execute(
        `SELECT substr(created_at, 1, 10) AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM parse_events GROUP BY day ORDER BY day DESC LIMIT 14`
      ),
      client.execute(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
                COUNT(DISTINCT ip_hash) AS users,
                COUNT(DISTINCT video_url) AS unique_links
         FROM parse_events`
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
