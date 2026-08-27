/**
 * 图片一键下载工具（纯前端实现，不依赖后端代理）。
 *
 * 背景：项目部署在 Cloudflare Workers 免费层，不支持流式代理，
 * 视频/图片一律直链。但图集场景用户需要「一键下载」：
 * 这里通过 fetch 原图 → Blob → a[download] 触发浏览器真实保存；
 * 若图床不支持 CORS（fetch 被拒），自动回退为在新窗口打开直链（用户右键另存）。
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

/** 从图片 URL 提取扩展名（处理 query / `!` 处理参数），默认空串 */
function getImageExt(src: string): string {
  const clean = src.split("?")[0].split("!")[0];
  const m = clean.match(/\.(jpe?g|png|webp|gif|avif|bmp)(?!\w)/i);
  return m ? m[1].toLowerCase() : "";
}

/** 根据 Blob 实际类型补全文件名扩展名 */
function ensureExt(filename: string, blob: Blob, src: string): string {
  if (/\.[a-z0-9]{2,4}$/i.test(filename)) return filename;
  return `${filename}.${EXT_BY_TYPE[blob.type] || getImageExt(src) || "jpg"}`;
}

/** 单张图片下载：优先真实下载（Blob + a[download]），CORS 失败回退新窗口打开 */
export async function downloadImage(src: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    // 响应可能是 HTML 错误页而非图片，做基础校验
    if (!blob.type.startsWith("image/") && blob.size < 1024) {
      throw new Error("not an image");
    }
    const name = ensureExt(filename, blob, src);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    // 图床不支持 CORS / 防盗链：回退为新窗口打开直链
    window.open(src, "_blank", "noopener,noreferrer");
    return false;
  }
}

/**
 * 批量下载全部图片（逐个触发，带间隔避免浏览器批量拦截）。
 * @returns 真实下载成功的张数（回退打开的算失败）
 */
export async function downloadAllImages(
  images: string[],
  baseName: string
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < images.length; i++) {
    const okOne = await downloadImage(images[i], `${baseName}-${i + 1}`);
    if (okOne) ok++;
    // 间隔避免浏览器把连续下载当作批量/恶意行为
    await new Promise((r) => setTimeout(r, 400));
  }
  return ok;
}
