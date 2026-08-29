import { getCorsHeaders } from "@/lib/api-utils";

export const runtime = "nodejs";

/**
 * 功能开关配置接口（供小程序等客户端远程读取，决定是否展示视频解析入口）。
 * 小程序审核期间不配置 VIDEO_PARSE_ENABLED，videoParseEnabled 返回 false
 * 隐藏解析功能；审核通过后把该变量设为 "true"（wrangler.toml [vars] 或
 * Worker 的 Settings → Variables）重新部署即可放开，未配置时默认关闭。
 */
export async function GET(request) {
  const corsHeaders = getCorsHeaders(request?.headers?.get("origin") || "");

  const videoParseEnabled = process.env.VIDEO_PARSE_ENABLED === "true";

  return Response.json(
    {
      code: 200,
      msg: "ok",
      data: {
        videoParseEnabled,
      },
    },
    {
      status: 200,
      headers: {
        ...corsHeaders,
        // 开关必须实时生效，禁止任何层缓存
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
