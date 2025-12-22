// API 工具函数：缓存和速率限制

// 缓存相关配置
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
let cache = new Map();

export const getCachedResponse = (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

export const setCacheResponse = (url, data) => {
  cache.set(url, {
    data,
    timestamp: Date.now()
  });
};

// 速率限制相关配置
export const rateLimit = (() => {
  const requests = new Map();
  const WINDOW_SIZE = 60000; // 1分钟
  const MAX_REQUESTS = 10; // 每分钟最多10次请求

  return (ip) => {
    const now = Date.now();
    const userRequests = requests.get(ip) || [];
    
    // 清理过期请求
    const recentRequests = userRequests.filter(time => now - time < WINDOW_SIZE);
    
    if (recentRequests.length >= MAX_REQUESTS) {
      return false; // 超出限制
    }
    
    recentRequests.push(now);
    requests.set(ip, recentRequests);
    return true; // 允许请求
  };
})();

// URL 验证函数
export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (error) {
    console.warn('Invalid URL provided:', error);
    return false;
  }
};