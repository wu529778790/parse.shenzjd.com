import { logger } from "@/lib/api-utils";

export const runtime = "nodejs";

// 健康检查端点
export async function GET() {
  const startTime = Date.now();

  try {
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      environment: process.env.NODE_ENV || "development",
    };

    return Response.json(response, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error("Health check failed:", error.message);

    return Response.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
