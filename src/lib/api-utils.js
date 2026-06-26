// API 工具函数：缓存、速率限制和日志

// 环境检测
const isDevelopment = process.env.NODE_ENV === 'development';

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

// 成功响应
export const successResponse = (data, msg = "解析成功") => {
  return createResponse(200, msg, data);
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