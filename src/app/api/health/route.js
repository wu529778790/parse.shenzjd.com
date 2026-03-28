import { logger } from "@/lib/api-utils";

export const runtime = "edge";

// 健康检查端点
export async function GET(request) {
  const startTime = Date.now();
  
  try {
    // 检查环境变量
    const envStatus = {
      douyin: !!process.env.DOUYIN_COOKIE,
      bilibili: !!process.env.BILIBILI_COOKIE,
      weibo: !!process.env.WEIBO_COOKIE,
    };
    
    // 获取客户端IP
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    request.headers.get('cf-connecting-ip') ||
                    'unknown';
    
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      environment: process.env.NODE_ENV || "development",
      platform: {
        douyin: envStatus.douyin ? "configured" : "not_configured",
        bilibili: envStatus.bilibili ? "configured" : "not_configured",
        weibo: envStatus.weibo ? "configured" : "not_configured",
        kuaishou: "always_available",
        xhs: "always_available",
      },
      clientIP,
    };
    
    logger.log("Health check from:", clientIP);
    
    return Response.json(response, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error("Health check failed:", error.message);
    
    return Response.json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
