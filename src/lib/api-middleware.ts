// 通用 API 中间件函数
import {
  getCachedResponse,
  setCacheResponse,
  rateLimit,
  isValidUrl,
  sanitizeUrl,
  getClientIP,
  getCorsHeaders,
  logger,
  errorResponse,
  serverErrorResponse,
  parseErrorResponse
} from "@/lib/api-utils";
import { verifyBasicAuth, unauthorizedResponse, isAuthEnabled } from "@/lib/auth";

/**
 * 安全的状态码 - 确保在 200-599 范围内
 */
export function safeStatus(code: number): number {
  const num = Number(code);
  if (Number.isNaN(num)) return 500;
  if (num < 200) return 500;
  if (num > 599) return 500;
  return Math.round(num);
}

export interface ApiHandlerOptions {
  shouldCache?: boolean;
  responseHeaders?: Record<string, string>;
  requireAuth?: boolean;
}

type ParseFunction = (url: string) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

// 通用 API 处理函数
export const createApiHandler = (
  parseFunction: ParseFunction,
  options: ApiHandlerOptions = {}
): ((request: Request) => Promise<Response>) => {
  const {
    shouldCache = true,
    responseHeaders = {},
    requireAuth = false, // 是否需要认证
  } = options;

  const extraHeaders = {
    ...responseHeaders,
  };

  return async (request: Request): Promise<Response> => {
    const startTime = Date.now();
    const corsHeaders = getCorsHeaders(request.headers.get('origin') || '') as Record<string, string>;
    const headers = { ...corsHeaders, ...extraHeaders };

    // Basic Auth 验证
    if (requireAuth || isAuthEnabled()) {
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
          status: safeStatus(429),
          headers
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return Response.json(
        errorResponse("url为空", 400),
        {
          status: safeStatus(400),
          headers
        }
      );
    }

    // 验证URL格式
    if (!isValidUrl(url)) {
      return Response.json(
        errorResponse("无效的URL格式", 400),
        {
          status: safeStatus(400),
          headers
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
          status: safeStatus(400),
          headers
        }
      );
    }

    if (shouldCache) {
      const cached = getCachedResponse(sanitizedUrl);
      if (cached) {
        const duration = Date.now() - startTime;
        logger.log(`Cache hit, response time: ${duration}ms`);
        return Response.json(cached, {
          headers,
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
            status: safeStatus(400),
            headers
          }
        );
      }

      if (shouldCache) {
        setCacheResponse(sanitizedUrl, result);
      }

      const duration = Date.now() - startTime;
      logger.log(`Parse successful, response time: ${duration}ms`);

      return Response.json(result, {
        headers,
      });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`API error after ${duration}ms:`, errMsg);
      return Response.json(
        serverErrorResponse(error),
        {
          status: safeStatus(500),
          headers
        }
      );
    }
  };
};
