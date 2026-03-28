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
    if (isDevelopment) {
      console.warn(...args);
    }
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
let cache = new Map();

export const getCachedResponse = (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.log('Cache hit for:', url.substring(0, 50) + '...');
    return cached.data;
  }
  logger.log('Cache miss for:', url.substring(0, 50) + '...');
  return null;
};

export const setCacheResponse = (url, data) => {
  cache.set(url, {
    data,
    timestamp: Date.now()
  });
  logger.log('Cache set for:', url.substring(0, 50) + '...');
};

// 清理过期缓存
export const cleanupCache = () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.log(`Cleaned up ${cleaned} expired cache entries`);
  }
};

// 速率限制相关配置
export const rateLimit = (() => {
  const requests = new Map();
  const WINDOW_SIZE = 60000; // 1分钟
  const MAX_REQUESTS = 10; // 每分钟最多10次请求

  // 定期清理过期记录
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of requests.entries()) {
      const recentRequests = times.filter(time => now - time < WINDOW_SIZE);
      if (recentRequests.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, recentRequests);
      }
    }
  }, WINDOW_SIZE);

  return (ip) => {
    const now = Date.now();
    const userRequests = requests.get(ip) || [];
    
    // 清理过期请求
    const recentRequests = userRequests.filter(time => now - time < WINDOW_SIZE);
    
    if (recentRequests.length >= MAX_REQUESTS) {
      logger.warn(`Rate limit exceeded for IP: ${ip}`);
      return false; // 超出限制
    }
    
    recentRequests.push(now);
    requests.set(ip, recentRequests);
    logger.log(`Request allowed for IP: ${ip}, count: ${recentRequests.length}/${MAX_REQUESTS}`);
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
    
    // 防止访问内网地址
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '192.168.'
    ];
    
    for (const blocked of blockedHostnames) {
      if (hostname === blocked || hostname.startsWith(blocked)) {
        throw new Error(`Blocked hostname: ${hostname}`);
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
export const serverErrorResponse = (error) => {
  const message = error?.message || "服务器错误";
  return createResponse(500, message);
};

// 解析失败响应
export const parseErrorResponse = (msg = "解析失败") => {
  return createResponse(400, msg);
};