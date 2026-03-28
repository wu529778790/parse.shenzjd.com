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

// 通用 API 处理函数
export const createApiHandler = (parseFunction) => {
  return async (request) => {
    const startTime = Date.now();
    
    // 获取客户端IP
    const clientIP = getClientIP(request);
    logger.log(`API request from IP: ${clientIP}`);
    
    // 检查速率限制
    if (!rateLimit(clientIP)) {
      return Response.json(
        errorResponse("请求过于频繁，请稍后再试", 429),
        { 
          status: 429, 
          headers: { "Access-Control-Allow-Origin": "*" } 
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
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
    
    // 验证URL格式
    if (!isValidUrl(url)) {
      return Response.json(
        errorResponse("无效的URL格式", 400),
        { 
          status: 400, 
          headers: { "Access-Control-Allow-Origin": "*" } 
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
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
    
    // 检查缓存
    const cached = getCachedResponse(sanitizedUrl);
    if (cached) {
      const duration = Date.now() - startTime;
      logger.log(`Cache hit, response time: ${duration}ms`);
      return Response.json(cached, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
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
            headers: { "Access-Control-Allow-Origin": "*" } 
          }
        );
      }
      
      // 设置缓存
      setCacheResponse(sanitizedUrl, result);
      
      const duration = Date.now() - startTime;
      logger.log(`Parse successful, response time: ${duration}ms`);
      
      return Response.json(result, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`API error after ${duration}ms:`, error.message);
      return Response.json(
        serverErrorResponse(error),
        { 
          status: 500, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
  };
};