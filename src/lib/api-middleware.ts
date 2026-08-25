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
import { normalizeResult } from "@/lib/normalize-result";
import { recordParse } from "@/lib/analytics";

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
  } = options;

  const extraHeaders = {
    ...responseHeaders,
  };

  return async (request: Request): Promise<Response> => {
    const startTime = Date.now();
    const corsHeaders = getCorsHeaders(request.headers.get('origin') || '') as Record<string, string>;
    const headers = { ...corsHeaders, ...extraHeaders };

    // 获取客户端IP
    const clientIP = getClientIP(request);
    logger.log(`API request from IP: ${clientIP}`);

    // 平台使用统计：生产环境 logger.log 不输出，这里用 console.log 确保线上可观测。
    // 从 URL 路径推断平台（如 /api/bilibili -> bilibili），用于排查各平台是否有人使用。
    // routeMatch 提升到函数级，供成功分支的行为分析记录复用。
    let routeMatch: RegExpMatchArray | null = null;
    try {
      const pathname = new URL(request.url).pathname;
      routeMatch = pathname.match(/\/api\/([a-z0-9]+)/i);
      if (routeMatch) {
        console.log(
          `[usage] route=${routeMatch[1]} time=${new Date().toISOString()}`
        );
      }
    } catch {
      // 日志失败不影响主流程
    }

    // 每次解析打印一条流水日志（console.log 保证生产环境也输出，对齐 [usage] 风格；
    // logger.log 仅开发环境输出，成功解析在生产上会没日志）
    const logParse = (
      status: string,
      code: number | string,
      durationMs: number,
      reason?: string
    ) => {
      const route = String(routeMatch?.[1] || "");
      const safeUrl = sanitizedUrl || "";
      const shortUrl =
        safeUrl.length > 60 ? safeUrl.slice(0, 60) + "..." : safeUrl;
      console.log(
        `[parse] route=${route} url=${shortUrl} status=${status} code=${code} time=${durationMs}ms${
          reason ? ` reason=${reason.slice(0, 80)}` : ""
        }`
      );
    };

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
        logParse("cached", 200, duration);
        return Response.json(cached, {
          headers,
        });
      }
    }

    try {
      logger.log(`Parsing URL: ${sanitizedUrl.substring(0, 80)}...`);
      const rawResult = await parseFunction(sanitizedUrl);

      if (!rawResult) {
        const duration = Date.now() - startTime;
        logParse("failed", 400, duration, "解析失败（无返回结果）");
        logger.warn(`Parse failed after ${duration}ms for URL: ${sanitizedUrl.substring(0, 80)}`);
        // 失败也记录：便于发现未支持/失效的平台与链接。
        // 注意：必须 await —— CF Workers 响应返回后 isolate 冻结，
        // fire-and-forget 的 Turso 写入请求会被丢弃（线上曾因此零入库）。
        await recordParse({
          platform: String(routeMatch?.[1] || ""),
          url: sanitizedUrl,
          ip: clientIP,
          status: "failed",
          reason: "解析失败（无返回结果）",
        }).catch(() => {});
        return Response.json(
          parseErrorResponse("解析失败"),
          {
            status: safeStatus(400),
            headers
          }
        );
      }

      // 统一响应模型：成功结果在出口统一归一化（code=200 + data 统一字段契约）
      const result = normalizeResult(rawResult);

      // 解析结果（成功/失败）异步记录行为分析。
      // 必须 await（同 CF Workers isolate 冻结问题），写入失败静默不影响主流程
      if (result?.code === 200) {
        await recordParse({
          platform: String(result.platform || routeMatch?.[1] || ""),
          url: sanitizedUrl,
          ip: clientIP,
          status: "success",
        }).catch(() => {});
        logParse("success", 200, Date.now() - startTime);
      } else {
        await recordParse({
          platform: String(routeMatch?.[1] || ""),
          url: sanitizedUrl,
          ip: clientIP,
          status: "failed",
          reason: String(result?.msg || "解析失败"),
        }).catch(() => {});
        logParse(
          "failed",
          Number(result?.code || 0),
          Date.now() - startTime,
          String(result?.msg || "")
        );
      }

      if (shouldCache) {
        setCacheResponse(sanitizedUrl, result);
      }

      return Response.json(result, {
        headers,
      });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logParse("error", 500, duration, errMsg);
      logger.error(`API error after ${duration}ms:`, errMsg);
      await recordParse({
        platform: String(routeMatch?.[1] || ""),
        url: sanitizedUrl,
        ip: clientIP,
        status: "failed",
        reason: errMsg,
      }).catch(() => {});
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
