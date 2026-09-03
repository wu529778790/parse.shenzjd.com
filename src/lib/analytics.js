/**
 * 解析行为分析 —— 把每次成功解析记录到 Turso（libsql）数据库，
 * 用于按平台/按天统计用户使用情况。
 *
 * 设计原则：
 * - 惰性连接：未配置 TURSO_DB_URL/TURSO_AUTH_TOKEN 时全部静默跳过，不影响主流程；
 * - 缓冲批量写：recordParse 只把事件压入内存缓冲（含一次本地 SHA-256，微秒级，
 *   无 DB I/O，调用方无须 await），攒满 FLUSH_SIZE 条或每 FLUSH_INTERVAL_MS
 *   用一次 Turso pipeline 请求批量刷入——把"每次解析一次 HTTP 往返"降为
 *   "每批一次"，同时把 DB 延迟彻底移出解析响应路径（Docker 常驻进程安全；
 *   注意：无共享内存的 Serverless 运行时不适配本缓冲，进程冻结会丢缓冲区）；
 * - 读缓存：queryStats 是全表聚合（GROUP BY / COUNT DISTINCT，扫描行数=事件总数），
 *   结果缓存 STATS_CACHE_TTL_MS，避免统计轮询把免费额度的行读配额打爆；
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

// ---------------------------------------------------------------------------
// 缓冲批量写：攒满条数或到时即用一次 pipeline 请求刷入
// ---------------------------------------------------------------------------
const FLUSH_SIZE = 20;               // 攒满立即刷
const FLUSH_INTERVAL_MS = 30 * 1000; // 未满时最长等 30s
const MAX_BUFFER = 1000;             // 写入持续失败时防内存膨胀（丢最旧）

const INSERT_SQL =
  "INSERT INTO parse_events (platform, video_url, ip_hash, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)";

let buffer = []; // 每项 = INSERT 的位置参数数组
let flushTimer = null;
let flushing = false;

/** 把当前缓冲用一次批量请求写入（失败回灌等待重试） */
async function flushBuffer() {
  if (flushing || buffer.length === 0) return;
  const client = getClient();
  if (!client) return;
  const ok = await ensureTable();
  if (!ok) return;

  flushing = true;
  const batch = buffer;
  buffer = [];
  try {
    await client.batch(batch.map((args) => ({ sql: INSERT_SQL, args })));
  } catch (e) {
    logger.warn(`[analytics] 批量写入失败(${batch.length}条): ${e.message}`);
    // 失败回灌，等下次触发重试；超长截断丢弃最旧，防内存无限膨胀
    buffer = batch.concat(buffer);
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  } finally {
    flushing = false;
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
 * 记录一次解析事件（成功或失败）。只压入内存缓冲，不阻塞调用方；
 * 所有异常静默（记录失败不影响解析主流程）。
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
    buffer.push([
      platform,
      url,
      ipHash,
      status,
      reason.slice(0, 200),
      new Date().toISOString(),
    ]);
    if (buffer.length >= FLUSH_SIZE) {
      // 攒满一批立即后台刷写，不阻塞本次响应
      flushBuffer().catch(() => {});
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBuffer().catch(() => {});
      }, FLUSH_INTERVAL_MS);
      // 不阻止 Node 进程自然退出
      flushTimer.unref?.();
    }
  } catch (e) {
    logger.warn(`[analytics] 记录失败: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 聚合统计（供 /api/stats 使用）：全表聚合代价高，结果做短 TTL 内存缓存
// ---------------------------------------------------------------------------
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
let statsCache = null; // { data, expiresAt }；只缓存成功查询，失败不缓存

/**
 * 查询聚合统计。命中缓存直接返回（统计口径分钟级新鲜度足够）；
 * 缓存未命中的全表聚合 + 最近 30s 缓冲未刷写的事件，可能有秒级延迟，可接受。
 * @returns {Promise<null | { totals: object, byPlatform: object[], byDay: object[] }>}
 */
export async function queryStats() {
  if (statsCache && statsCache.expiresAt > Date.now()) {
    return statsCache.data;
  }
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
    const data = {
      totals: totals.rows[0],
      byPlatform: byPlatform.rows,
      byDay: byDay.rows,
    };
    statsCache = { data, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
    return data;
  } catch (e) {
    logger.warn(`[analytics] 查询统计失败: ${e.message}`);
    return null;
  }
}

/** 测试辅助：立即刷写缓冲并清掉定时器（生产勿用） */
export async function __flushAnalyticsForTest() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}

/** 测试辅助：清空缓冲与统计缓存（避免跨用例串扰；生产勿用） */
export function __resetAnalyticsForTest() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  buffer = [];
  statsCache = null;
}
