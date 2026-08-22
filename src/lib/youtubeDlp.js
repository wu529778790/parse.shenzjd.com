/**
 * YouTube 解析：yt-dlp 封装（Docker 部署方案，零第三方接口依赖）
 *
 * 策略（2026-08 实测：YouTube 已全面取消渐进式格式，全部为 video/audio 分离流）：
 * 1. 快路径：若存在「渐进式 mp4」（含音视频），直接返回直链；
 * 2. 合并路径：否则用 yt-dlp 下载分离式最佳 video + audio（上限 720p），
 *    由 ffmpeg 自动合并成单个 mp4 落盘 /tmp/youtube/，返回站内播放地址
 *    /api/youtube/play?f=<fileId>（支持 Range 拖动与下载）。
 *
 * 依赖：Dockerfile 已安装 python3 + yt-dlp + ffmpeg；
 * 非 Docker 环境未安装时返回明确错误，不抛未捕获异常。
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "@/lib/api-utils";

// 可用环境变量覆盖
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const YTDLP_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 25000);
const YOUTUBE_TMP_DIR = process.env.YOUTUBE_TMP_DIR || "/tmp/youtube";
const MERGE_TIMEOUT_MS = Number(process.env.YTDLP_MERGE_TIMEOUT_MS || 90000);
// 合并上限：超过该时长的视频拒绝（下载合并耗时过长）
const MAX_MERGE_DURATION_S = Number(process.env.YOUTUBE_MAX_DURATION_S || 900);

/** 运行 yt-dlp 并返回 stdout 字符串；错误时抛 Error（含分类前缀） */
function runYtDlp(args, timeoutMs = YTDLP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(YTDLP_BIN, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (e) {
      reject(new Error(`YTDLP_NOT_FOUND: ${e.message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("YTDLP_TIMEOUT: 解析超时，可能是网络不可达或视频过大"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`YTDLP_NOT_FOUND: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout);
      } else {
        reject(new Error(`YTDLP_FAILED(${code}): ${(stderr || stdout).slice(0, 300)}`));
      }
    });
  });
}

/** 从 yt-dlp -J 输出中挑选渐进式 mp4 最佳直链，无则返回 null */
function pickProgressiveMp4(formats) {
  const list = Array.isArray(formats) ? formats : [];
  return (
    list
      .filter(
        (f) =>
          f.ext === "mp4" &&
          f.acodec &&
          f.acodec !== "none" &&
          f.vcodec &&
          f.vcodec !== "none"
      )
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0] || null
  );
}

/**
 * 合并路径：下载分离式视频+音频（上限 720p），ffmpeg 合并为单 mp4 落盘，
 * 返回站内播放地址。
 */
async function mergeAndServe(info, url) {
  const id = String(info.id || "video").replace(/[^\w-]/g, "");
  const title = info.title || "YouTube 视频";
  const duration = info.duration || 0;

  if (duration > MAX_MERGE_DURATION_S) {
    return {
      code: 201,
      msg: `解析失败：该视频时长超过 ${Math.floor(MAX_MERGE_DURATION_S / 60)} 分钟，暂不支持（视频较大，下载合并耗时过长）`,
    };
  }

  fs.mkdirSync(YOUTUBE_TMP_DIR, { recursive: true });
  const fileId = `yt_${id}_${Date.now()}`;
  const outPath = path.join(YOUTUBE_TMP_DIR, `${fileId}.mp4`);

  const args = [
    "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]",
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "15",
    "-o", outPath,
    url,
  ];

  try {
    await runYtDlp(args, MERGE_TIMEOUT_MS);
  } catch (error) {
    // 下载/合并失败：清理残留文件
    fs.promises.unlink(outPath).catch(() => {});
    const message = error.message || "";
    if (message.includes("YTDLP_TIMEOUT")) {
      return { code: 201, msg: "解析失败：视频下载合并超时（网络较慢或视频较大），请稍后重试" };
    }
    throw error;
  }

  const stat = await fs.promises.stat(outPath).catch(() => null);
  if (!stat || stat.size < 1024) {
    fs.promises.unlink(outPath).catch(() => {});
    return { code: 201, msg: "解析失败：视频合并结果异常，请稍后重试" };
  }

  logger.log(`[youtube] 合并完成：《${title.slice(0, 30)}》 ${(stat.size / 1048576).toFixed(1)}MB`);
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title,
      author: info.channel || info.uploader || "",
      cover: info.thumbnail || "",
      url: `/api/youtube/play?f=${encodeURIComponent(fileId)}.mp4`,
      type: "video",
      duration: duration * 1000, // 前端按毫秒处理
      filesize: stat.size,
    },
  };
}

/**
 * 解析 YouTube 视频链接，返回统一结果结构 { code, msg, data }
 * data 为 GenericParsedData 扁平结构（前端 GenericParsedVideo 直接渲染）
 */
export async function parseYoutube(url) {
  try {
    // 第一步：dump-json 拿元信息（标题/作者/封面/时长/格式）
    const args = [
      "-J",
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--socket-timeout", "15",
      url,
    ];
    const stdout = await runYtDlp(args);

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      logger.error("yt-dlp 输出不是合法 JSON:", stdout.slice(0, 200));
      return { code: 500, msg: "解析失败：yt-dlp 返回数据异常" };
    }

    // 快路径：渐进式 mp4 直链（个别视频仍有）
    const best = pickProgressiveMp4(info.formats);
    if (best && best.url) {
      logger.log(`[youtube] 渐进式直链：《${(info.title || "").slice(0, 30)}》(${best.height}p)`);
      return {
        code: 200,
        msg: "解析成功",
        data: {
          title: info.title || "YouTube 视频",
          author: info.channel || info.uploader || "",
          cover: info.thumbnail || "",
          url: best.url,
          type: "video",
          duration: (info.duration || 0) * 1000,
        },
      };
    }

    // 合并路径：分离式格式下载 + ffmpeg 合并（YouTube 当前主流）
    return await mergeAndServe(info, url);
  } catch (error) {
    const message = error.message || "";
    if (message.includes("YTDLP_NOT_FOUND")) {
      return {
        code: 500,
        msg: "解析失败：服务器未安装 yt-dlp（仅 Docker 部署支持 YouTube 解析）",
      };
    }
    if (message.includes("YTDLP_TIMEOUT")) {
      return { code: 201, msg: "解析失败：连接 YouTube 超时，请稍后重试" };
    }
    const detail = message
      .replace(/^YTDLP_FAILED\(\d+\):\s*/, "")
      .replace(/^ERROR:\s*/i, "")
      .slice(0, 120);
    logger.warn(`[youtube] 解析失败: ${detail}`);
    return {
      code: 201,
      msg: `解析失败：${detail || "未知错误"}（视频可能已删除、私密或受地区限制）`,
    };
  }
}

/** 清理临时目录中超过 1 小时的旧文件（play 路由请求时顺手调用） */
export async function cleanExpiredFiles(maxAgeMs = 3600000) {
  try {
    const entries = await fs.promises.readdir(YOUTUBE_TMP_DIR).catch(() => []);
    const now = Date.now();
    for (const name of entries) {
      if (!name.startsWith("yt_")) continue;
      const p = path.join(YOUTUBE_TMP_DIR, name);
      const st = await fs.promises.stat(p).catch(() => null);
      if (st && now - st.mtimeMs > maxAgeMs) {
        fs.promises.unlink(p).catch(() => {});
      }
    }
  } catch {
    /* 清理失败不影响主流程 */
  }
}

// 供 /api/youtube/play 路由读取合并产物
export { YOUTUBE_TMP_DIR };

export const _internal = { runYtDlp, YTDLP_BIN, YOUTUBE_TMP_DIR, pickProgressiveMp4 };
