// 通用 API 中间件函数
import {
  getCachedResponse,
  setCacheResponse,
  rateLimit,
  isValidUrl,
  sanitizeUrl,
  getClientIP,
  logger,
  errorResponse,
  serverErrorResponse,
  parseErrorResponse
} from "@/lib/api-utils";

// Basic Auth 配置（可选）
const AUTH_USERNAME = process.env.API_AUTH_USERNAME;
const AUTH_PASSWORD = process.env.API_AUTH_PASSWORD;

/**
 * 验证 Basic Auth
 */
function verifyBasicAuth(request) {
  // 如果没有配置用户名密码，则跳过验证
  if (!AUTH_USERNAME || !AUTH_PASSWORD) {
    return true;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(":");
    return username === AUTH_USERNAME && password === AUTH_PASSWORD;
  } catch {
    return false;
  }
}

/**
 * 返回 401 未授权响应
 */
function unauthorizedResponse() {
  return new Response(
    JSON.stringify({
      code: 401,
      msg: "未授权访问，请提供有效的认证信息",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Basic realm="Video Parser API"',
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

// 通用 API 处理函数
export const createApiHandler = (parseFunction, options = {}) => {
  const {
    shouldCache = true,
    responseHeaders = {},
    requireAuth = false, // 是否需要认证
  } = options;

  const jsonHeaders = {
    "Access-Control-Allow-Origin": "*",
    ...responseHeaders,
  };

  return async (request) => {
    const startTime = Date.now();

    // Basic Auth 验证
    if (requireAuth || AUTH_USERNAME) {
      if (!verifyBasicAuth(request)) {
        logger.warn(`Unauthorized access attempt from IP: ${getClientIP(request)}`);
        return unauthorizedResponse();
      }
    }

    // 获取客户端IP
    const clientIP = getClientIP(request);
    logger.log(`API request from IP: ${clientIP}`);
    
    // 检查速率限制
    if (!rateLimit(clientIP)) {
      return Response.json(
        errorResponse("请求过于频繁，请稍后再试", 429),
        {
          status: 429,
          headers: jsonHeaders
        }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return Response.json(
        errorResponse("url为空", 400),
        {
          status: 400,
          headers: jsonHeaders
        }
      );
    }
    
    // 验证URL格式
    if (!isValidUrl(url)) {
      return Response.json(
        errorResponse("无效的URL格式", 400),
        {
          status: 400,
          headers: jsonHeaders
        }
      );
    }
    
    // 安全检查：防止SSRF攻击
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) {
      logger.warn(`SSRF attempt blocked from IP: ${clientIP}, URL: ${url.substring(0, 100)}`);
      return Response.json(
        errorResponse("URL包含不允许访问的地址", 400),
        {
          status: 400,
          headers: jsonHeaders
        }
      );
    }
    
    if (shouldCache) {
      const cached = getCachedResponse(sanitizedUrl);
      if (cached) {
        const duration = Date.now() - startTime;
        logger.log(`Cache hit, response time: ${duration}ms`);
        return Response.json(cached, {
          headers: jsonHeaders,
        });
      }
    }

    try {
      logger.log(`Parsing URL: ${sanitizedUrl.substring(0, 80)}...`);
      const result = await parseFunction(sanitizedUrl);
      
      if (!result) {
        const duration = Date.now() - startTime;
        logger.warn(`Parse failed after ${duration}ms for URL: ${sanitizedUrl.substring(0, 80)}`);
        return Response.json(
          parseErrorResponse("解析失败"),
          {
            status: 400,
            headers: jsonHeaders
          }
        );
      }
      
      if (shouldCache) {
        setCacheResponse(sanitizedUrl, result);
      }
      
      const duration = Date.now() - startTime;
      logger.log(`Parse successful, response time: ${duration}ms`);
      
      return Response.json(result, {
        headers: jsonHeaders,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`API error after ${duration}ms:`, error.message);
      return Response.json(
        serverErrorResponse(error),
        {
          status: 500,
          headers: jsonHeaders
        }
      );
    }
  };
};
