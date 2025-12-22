// 通用 API 中间件函数
import { getCachedResponse, setCacheResponse, rateLimit, isValidUrl } from "@/lib/api-utils";

// 通用 API 处理函数
export const createApiHandler = (parseFunction) => {
  return async (request) => {
    // 获取客户端IP
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    request.headers.get('cf-connecting-ip') || 
                    'unknown';
    
    // 检查速率限制
    if (!rateLimit(clientIP)) {
      return Response.json(
        { code: 429, msg: "请求过于频繁，请稍后再试" },
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
        { code: 201, msg: "url为空" },
        { 
          status: 400, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
    
    // 验证URL格式
    if (!isValidUrl(url)) {
      return Response.json(
        { code: 400, msg: "无效的URL格式" },
        { 
          status: 400, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
    
    // 检查缓存
    const cached = getCachedResponse(url);
    if (cached) {
      return Response.json(cached, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    try {
      const result = await parseFunction(url);
      if (!result) {
        return Response.json(
          { code: 201, msg: "解析失败" },
          { 
            status: 400, 
            headers: { "Access-Control-Allow-Origin": "*" } 
          }
        );
      }
      
      // 设置缓存
      setCacheResponse(url, result);
      
      return Response.json(result, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      return Response.json(
        { code: 500, msg: "服务器错误", error: error.message || "未知错误" },
        { 
          status: 500, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        }
      );
    }
  };
};