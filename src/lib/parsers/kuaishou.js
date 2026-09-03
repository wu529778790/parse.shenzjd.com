/**
 * 快手解析（纯函数模块，无 HTTP 边界）
 * 由 /api/kuaishou 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { logger } from "@/lib/api-utils";
import { parseKuaishou, formatResponse } from "@/lib/kuaishouCore";
import { public17Parse } from "@/lib/douyinFallback";


// 使用中间件处理请求
async function kuaishouParse(url) {
  try {
    let result = await parseKuaishou(url);

    // 快手备用通道：主解析失败（页面结构变化/云端抓取超时/反爬）时，
    // 用 17change 公共 API 兜底（参考 video-unwatermark webparser 引擎，
    // 与 /api/parse 统一入口的兜底逻辑一致，实测对快手可用）。
    if (!result || result.code !== 200) {
      try {
        const fb = await public17Parse(url);
        if (fb.ok && fb.url) {
          logger.log(`快手主解析失败，公共 API 兜底命中（${fb.key}）`);
          return formatResponse(200, "解析成功", {
            photoUrl: fb.url,
            caption: fb.title || "视频",
            coverUrl: fb.cover || "",
            authorName: fb.author || "",
            source: fb.key,
          });
        }
      } catch (error) {
        logger.warn(`快手公共 API 兜底异常: ${error.message}`);
      }
      if (!result) {
        return formatResponse(404, "解析失败，可能是链接格式不支持或内容无法访问");
      }
    }
    return result;
  } catch (error) {
    logger.error("kuaishou parse error:", error);
    return formatResponse(500, "服务器内部错误");
  }
}

export default kuaishouParse;
