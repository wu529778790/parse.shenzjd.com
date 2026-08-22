import { createApiHandler } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import { parseYoutube } from "@/lib/youtubeDlp";

// yt-dlp 需要 child_process，仅 Node runtime 可用（Docker 部署）
export const runtime = "nodejs";

// YouTube 视频链接白名单（watch / youtu.be / shorts / embed）
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

async function youtube(url) {
  if (!YOUTUBE_URL_RE.test(url)) {
    logger.warn(`YouTube 链接格式不识别: ${url.slice(0, 60)}`);
    return {
      code: 400,
      msg: "无法解析视频 ID：请确保链接是有效的 YouTube 视频链接（watch/shorts/youtu.be）",
    };
  }
  return await parseYoutube(url);
}

export const GET = createApiHandler(youtube);
