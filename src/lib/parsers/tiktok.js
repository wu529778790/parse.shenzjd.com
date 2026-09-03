/**
 * TikTok解析（纯函数模块，无 HTTP 边界）
 * 由 /api/tiktok 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { logger } from "@/lib/api-utils";
import { parseTiktok } from "@/lib/tiktokDlp";

// yt-dlp 需要 child_process，仅 Node runtime 可用（Docker 部署）

// TikTok 视频链接白名单：
// 标准 @user/video/{19位ID}、vm/vt 短链、m.tiktok.com/v、www.tiktok.com/t/ 短链
const TIKTOK_URL_RE =
  /(?:tiktok\.com\/@[\w.-]+\/video\/\d+|(?:vm|vt)\.tiktok\.com\/[\w-]+|m\.tiktok\.com\/v\/\d+|tiktok\.com\/t\/[\w-]+)/i;

async function tiktok(url) {
  if (!TIKTOK_URL_RE.test(url)) {
    logger.warn(`TikTok 链接格式不识别: ${url.slice(0, 60)}`);
    return {
      code: 400,
      msg: "无法解析视频 ID：请确保链接是有效的 TikTok 视频链接（@用户/video 或 vm/vt 短链）",
    };
  }
  return await parseTiktok(url);
}

export default tiktok;
