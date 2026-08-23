/**
 * TikTok 解析：yt-dlp 封装（复用 YouTube 方案的 Docker 部署模式）
 *
 * 实测（2026-08-23）：新版 yt-dlp（>=2026.08）可正常解析 TikTok；
 * 视频为「渐进式 mp4 单文件」，直接返回直链，无需 ffmpeg 合并。
 * 旧版 yt-dlp 的 TikTok extractor 会报 "Unable to extract universal data"，
 * 因此 Dockerfile 用 pip 安装最新版（不锁旧版本号）。
 *
 * 依赖：Dockerfile 已安装 python3 + yt-dlp；非 Docker 环境返回明确错误。
 */

import { spawn } from "child_process";
import { logger } from "@/lib/api-utils";

// 支持 YTDLP_BIN 含参数（如 "python3 -m yt_dlp"），默认走 PATH 里的 yt-dlp
const YTDLP_CMD = (process.env.YTDLP_BIN || "yt-dlp").trim().split(/\s+/);
const YTDLP_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 25000);

/** 运行 yt-dlp 并返回 stdout；错误时抛 Error（含分类前缀） */
function runYtDlp(args, timeoutMs = YTDLP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(YTDLP_CMD[0], [...YTDLP_CMD.slice(1), ...args], {
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

/** 睡眠工具（重试间隔） */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 单次解析尝试，返回统一结果结构 { code, msg, data }
 */
async function tryParseOnce(url) {
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

  // TikTok 为渐进式 mp4（含音视频），选最高清晰度直链
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const progressive = formats
    .filter(
      (f) =>
        f.ext === "mp4" &&
        f.acodec &&
        f.acodec !== "none" &&
        f.vcodec &&
        f.vcodec !== "none"
    )
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const best = progressive[0];
  if (!best || !best.url) {
    return { code: 201, msg: "解析失败：未获取到可播放的视频地址（视频可能已删除或私密）" };
  }

  logger.log(`[tiktok] 解析成功：《${(info.title || "").slice(0, 30)}》(${best.height || "?"}p mp4)`);
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: info.title || "TikTok 视频",
      author: info.uploader || info.creator || info.channel || "",
      cover: info.thumbnail || "",
      url: best.url,
      type: "video",
      duration: (info.duration || 0) * 1000, // 前端按毫秒处理
    },
  };
}

/** 错误信息是否值得重试（TikTok 反爬为概率性，重试成功率很高） */
function isRetryableError(message) {
  return (
    /rehydration|Unable to extract|unexpected|bot|risk|reload/i.test(message) ||
    message.includes("YTDLP_TIMEOUT")
  );
}

/**
 * 解析 TikTok 视频链接（带自动重试），返回统一结果结构 { code, msg, data }
 * data 为 GenericParsedData 扁平结构（前端 GenericParsedVideo 直接渲染）
 */
export async function parseTiktok(url) {
  const MAX_ATTEMPTS = 3;
  let lastMsg = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await tryParseOnce(url);
      if (result.code !== 201 || !isRetryableError(result.msg)) {
        return result;
      }
      lastMsg = result.msg;
      logger.warn(`[tiktok] 第 ${attempt}/${MAX_ATTEMPTS} 次被反爬，稍后重试`);
    } catch (error) {
      const message = error.message || "";
      if (message.includes("YTDLP_NOT_FOUND")) {
        return {
          code: 500,
          msg: "解析失败：服务器未安装 yt-dlp（仅 Docker 部署支持 TikTok 解析）",
        };
      }
      lastMsg = message;
      if (!isRetryableError(message)) {
        break;
      }
      logger.warn(`[tiktok] 第 ${attempt}/${MAX_ATTEMPTS} 次失败，稍后重试`);
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1500 * attempt); // 递增退避：1.5s / 3s
    }
  }

  if (lastMsg.includes("YTDLP_TIMEOUT")) {
    return { code: 201, msg: "解析失败：连接 TikTok 超时，请稍后重试" };
  }
  const detail = lastMsg
    .replace(/^YTDLP_FAILED\(\d+\):\s*/, "")
    .replace(/^ERROR:\s*/i, "")
    .slice(0, 120);
  logger.warn(`[tiktok] 解析失败: ${detail}`);
  return {
    code: 201,
    msg: `解析失败：${detail || "未知错误"}（视频可能已删除、私密或受地区限制；TikTok 风控严格时可稍后重试）`,
  };
}

export const _internal = { runYtDlp };
