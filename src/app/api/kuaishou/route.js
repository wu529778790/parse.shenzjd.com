import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import { parseKuaishou, formatResponse } from "@/lib/kuaishouCore";

export const runtime = "edge";

// 使用中间件处理请求
async function kuaishouParse(url) {
  try {
    const result = await parseKuaishou(url);
    if (!result) {
      return formatResponse(404, "解析失败，可能是链接格式不支持或内容无法访问");
    }
    return result;
  } catch (error) {
    logger.error("kuaishou parse error:", error);
    return formatResponse(500, "服务器内部错误");
  }
}

export const GET = createApiHandler(kuaishouParse);
