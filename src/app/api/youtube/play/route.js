import { createReadStream } from "fs";
import { statSync } from "fs";
import path from "path";
import { logger } from "@/lib/api-utils";
import { YOUTUBE_TMP_DIR, cleanExpiredFiles } from "@/lib/youtubeDlp";

// 流式返回合并后的 mp4（需读写本地文件，仅 Node runtime / Docker 部署）
export const runtime = "nodejs";

// 文件名白名单：仅允许本服务生成的 yt_*.mp4，防路径穿越
const FILE_RE = /^yt_[A-Za-z0-9_-]+\.mp4$/;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const f = searchParams.get("f") || "";
  if (!FILE_RE.test(f)) {
    return Response.json({ code: 400, msg: "参数错误" }, { status: 400 });
  }

  const filePath = path.join(YOUTUBE_TMP_DIR, f);
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return Response.json({ code: 404, msg: "文件不存在或已过期，请重新解析" }, { status: 404 });
  }

  // 顺手清理过期文件（1 小时前的合并产物）
  cleanExpiredFiles().catch(() => {});

  const size = stat.size;
  const range = request.headers.get("range");
  const mime = "video/mp4";

  // 支持 Range（浏览器拖动进度条 / 断点下载）
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startStr, endStr] = range.replace("bytes=", "").split("-");
    const start = startStr ? parseInt(startStr, 10) : 0;
    const end = endStr ? parseInt(endStr, 10) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const chunkSize = Math.min(end - start + 1, size - start);
    const stream = createReadStream(filePath, { start, end });
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${start + chunkSize - 1}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  logger.log(`[youtube] 播放/下载: ${f} (${(size / 1048576).toFixed(1)}MB)`);
  return new Response(createReadStream(filePath), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
