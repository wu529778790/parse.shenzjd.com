// API 工具函数：缓存、速率限制和日志

// 「内容已删除」统一文案：解析器对确定性的永久失败（原内容已删除/不可见）统一返回
// 此 msg，result-cache 据此把这类失败也写入共享缓存（瞬时反爬失败仍然不缓存）
export const DELETED_CONTENT_MSG = "该内容已被删除";

// 环境检测
const isDevelopment = process.env.NODE_ENV === 'development';

// 北京时间格式化（日志用）：YYYY-MM-DD HH:mm:ss
// 各路由的流水日志统一用北京时间，避免看日志时手动 +8 换算
export function beijingNow() {
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

// 条件日志工具
export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args) => {
    // warn 在生产环境也输出，便于线上问题排查
    console.warn(...args);
  },
  error: (...args) => {
    // 生产环境也记录错误
    console.error(...args);
  },
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  }
};

// 缓存相关配置
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
const CACHE_MAX_SIZE = 500;          // 最大缓存条目数
let cache = new Map();

// 惰性清理过期缓存
function evictExpiredCache() {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.log(`Cleaned up ${cleaned} expired cache entries, remaining: ${cache.size}`);
  }
}

export const getCachedResponse = (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.log('Cache hit for:', url.substring(0, 50) + '...');
    return cached.data;
  }
  // 过期条目立即删除
  if (cached) {
    cache.delete(url);
  }
  logger.log('Cache miss for:', url.substring(0, 50) + '...');
  return null;
};

export const setCacheResponse = (url, data) => {
  // 只缓存成功结果（code=200）：失败可能是瞬时反爬/网络抖动，缓存会放大错误，
  // 用户重试时命中缓存的错误结果永远无法重新解析成功。
  if (!data || data.code !== 200) {
    logger.log('Skip cache for non-success result:', url.substring(0, 50) + '...');
    return;
  }
  // 超过阈值时触发惰性清理
  if (cache.size >= CACHE_MAX_SIZE) {
    evictExpiredCache();
  }
  cache.set(url, {
    data,
    timestamp: Date.now()
  });
  logger.log('Cache set for:', url.substring(0, 50) + '...');
};

// 速率限制相关配置
export const rateLimit = (() => {
  const requests = new Map();
  const WINDOW_SIZE = 60000; // 1分钟
  const MAX_REQUESTS = 60; // 每分钟最多60次请求（视频播放+图片代理会产生大量请求）

  return (ip) => {
    // Vitest 单测会短时间触发大量解析请求，避免误触生产限流逻辑
    if (process.env.VITEST === "true") {
      return true;
    }
    const now = Date.now();
    // 取 x-forwarded-for 的第一个 IP（真实客户端 IP）
    const realIp = ip.split(",")[0].trim();
    const userRequests = requests.get(realIp) || [];

    // 清理过期请求
    const recentRequests = userRequests.filter(time => now - time < WINDOW_SIZE);

    if (recentRequests.length >= MAX_REQUESTS) {
      logger.warn(`Rate limit exceeded for IP: ${realIp}`);
      return false; // 超出限制
    }

    recentRequests.push(now);
    requests.set(realIp, recentRequests);
    logger.log(`Request allowed for IP: ${realIp}, count: ${recentRequests.length}/${MAX_REQUESTS}`);
    return true; // 允许请求
  };
})();

// URL 验证函数
export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (error) {
    logger.warn('Invalid URL provided:', error.message);
    return false;
  }
};

// URL 清理函数 - 防止SSRF攻击
export const sanitizeUrl = (url) => {
  try {
    const parsedUrl = new URL(url);

    // 仅允许 http/https scheme
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Blocked scheme: ${parsedUrl.protocol}`);
    }

    // 防止访问内网地址
    // new URL() 对 IPv6 保留方括号，统一去掉
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // 精确匹配的主机名
    const blockedExact = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '::',
      '0:0:0:0:0:0:0:1',
      '0:0:0:0:0:0:0:0',
    ];

    if (blockedExact.includes(hostname)) {
      throw new Error(`Blocked hostname: ${hostname}`);
    }

    // 前缀匹配 — IPv4 私有段 + 链路本地
    const blockedPrefixes = [
      '10.',
      '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.',
      '172.24.', '172.25.', '172.26.', '172.27.',
      '172.28.', '172.29.', '172.30.', '172.31.',
      '192.168.',
      '169.254.',          // 链路本地 / 云元数据端点
    ];

    // IPv4-mapped IPv6 私有地址（URL标准化后 ::ffff:x.x.x.x 变为 ::ffff:hex）
    const blockedIPv4MappedPrefixes = [
      '::ffff:7f00:',     // ::ffff:127.0.0.1 → ::ffff:7f00:1
      '::ffff:a:',        // ::ffff:10.x.x.x → ::ffff:a:*
      '::ffff:ac10:',     // ::ffff:172.16.x.x → ::ffff:ac10:*
      '::ffff:c0a8:',     // ::ffff:192.168.x.x → ::ffff:c0a8:*
      '::ffff:a9fe:',     // ::ffff:169.254.x.x → ::ffff:a9fe:*
    ];

    // IPv6 私有地址段前缀匹配
    const blockedIPv6Prefixes = [
      'fc00:', 'fd00:',     // 唯一本地地址 (ULA)
      'fe80:',             // 链路本地
    ];

    for (const prefix of blockedPrefixes) {
      if (hostname.startsWith(prefix)) {
        throw new Error(`Blocked hostname: ${hostname}`);
      }
    }

    for (const prefix of blockedIPv4MappedPrefixes) {
      if (hostname.startsWith(prefix)) {
        throw new Error(`Blocked IPv4-mapped hostname: ${hostname}`);
      }
    }

    for (const prefix of blockedIPv6Prefixes) {
      if (hostname.startsWith(prefix)) {
        throw new Error(`Blocked IPv6 hostname: ${hostname}`);
      }
    }

    return parsedUrl.toString();
  } catch (error) {
    logger.warn('URL sanitization failed:', error.message);
    return null;
  }
};

// 安全获取客户端IP
export const getClientIP = (request) => {
  return request.headers.get('x-forwarded-for') ||
         request.headers.get('x-real-ip') ||
         request.headers.get('cf-connecting-ip') ||
         'unknown';
};

// ---------------------------------------------------------------------------
// IP 黑名单：拦截绕过前端、直连解析接口的高频爬虫/脚本
// （依据 data/*.log 的「未认证解析被拒绝」记录，2026-08-26 自动生成）。
// - 前缀列表：高频段（>=30 次）按 IPv4 /24 或 IPv6 /64 段拉黑，避免误伤；
// - 精确列表：低频单 IP 精确匹配。
// 新增：前缀 → BLOCKED_IP_PREFIXES，单 IP → BLOCKED_IPS。
// ---------------------------------------------------------------------------
const BLOCKED_IP_PREFIXES = [
  "240e:465:5d60:e459:",
  "2409:8d34:26:674c:",
];
const BLOCKED_IPS = new Set([
  "120.42.187.174",
  "110.248.71.229",
  "2409:8a34:4e86:73d0:80b2:7e98:30b9:743",
  "62.234.27.235",
  "27.149.93.103",
]);


/**
 * 判断客户端 IP 是否命中黑名单（解析类接口入口拦截用）。
 * - x-forwarded-for 可能是 "ip1, ip2" 链，取第一段（真实客户端 IP）
 * - 清洗：去引号/空白/括号、转小写
 * - 匹配：前缀（IPv4 段 / IPv6 段）→ 精确（Set）
 */
export const isBlockedIP = (ip) => {
  if (!ip) return false;
  const first = String(ip).split(",")[0].trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!first) return false;

  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (first.startsWith(prefix)) return true;
  }
  return BLOCKED_IPS.has(first);
};

// CORS 头生成 — 仅允许 *.shenzjd.com
const ALLOWED_ORIGIN_SUFFIX = '.shenzjd.com';

export const getCorsHeaders = (origin) => {
  if (!origin || typeof origin !== 'string') return {};
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (hostname === 'shenzjd.com' || hostname.endsWith(ALLOWED_ORIGIN_SUFFIX)) {
      return { 'Access-Control-Allow-Origin': origin };
    }
  } catch {
    // 无效的 origin，不返回 CORS 头
  }
  return {};
};

// 标准API响应格式
export const createResponse = (code, msg, data = null) => {
  const response = { code, msg };
  if (data !== null) {
    response.data = data;
  }
  return response;
};

// 错误响应
export const errorResponse = (msg, code = 400) => {
  return createResponse(code, msg);
};

// 服务器错误响应
// 对外只返回固定文案，不透传 error.message，避免泄漏内部实现细节
// （如被 SSRF 防护拦下的内网地址、库版本、文件路径），形成探测回带通道。
// 错误详情在此记入日志，确保可排查。
export const serverErrorResponse = (error) => {
  logger.error("服务器错误:", error?.message || "unknown error");
  return createResponse(500, "服务器内部错误");
};

// 解析失败响应
export const parseErrorResponse = (msg = "解析失败") => {
  return createResponse(400, msg);
};