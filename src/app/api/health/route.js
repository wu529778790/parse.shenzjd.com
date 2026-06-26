import { logger, getCorsHeaders } from "@/lib/api-utils";

export const runtime = "nodejs";

// 健康检查端点
export async function GET(request) {
  const startTime = Date.now();
  const corsHeaders = getCorsHeaders(
    (request?.headers?.get("origin") || "")
  );

  try {
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
    };

    return Response.json(response, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    // 错误细节只进日志，不回传客户端（避免泄漏内部信息）
    logger.error("Health check failed:", error?.message || "unknown error");

    return Response.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          ...corsHeaders,
        },
      }
    );
  }
}
