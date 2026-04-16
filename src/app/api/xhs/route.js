import { createApiHandler } from "@/lib/api-middleware";

export const runtime = "edge";

/** 小红书 H5：桌面 Chrome UA，短链统一走 https */
const XHS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";

function output(code, msg, data = []) {
  return {
    code,
    msg,
    data,
  };
}

function normalizeXhsUrl(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host === "xhslink.com" && u.protocol === "http:") {
      u.protocol = "https:";
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url.trim();
}

/**
 * 短链与笔记页：一次 GET 自动跟随重定向，直接取最终 HTML
 */
async function fetchXhsNoteHtml(url) {
  const target = normalizeXhsUrl(url);
  const response = await fetch(target, {
    headers: {
      "User-Agent": XHS_USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });

  const html = await response.text();
  return { html, finalUrl: response.url };
}

// 安全地获取嵌套属性
function safeGet(obj, path) {
  try {
    return path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return current[key];
      }
      return null;
    }, obj);
  } catch {
    return null;
  }
}

/**
 * 新版笔记页：note.currentNoteId + note.noteDetailMap[id].note
 * 旧版：noteData.data.noteData 等
 */
function resolveNotePayload(decoded) {
  const noteId = safeGet(decoded, "note.currentNoteId");
  const detailMap = safeGet(decoded, "note.noteDetailMap");
  if (noteId && detailMap && typeof detailMap === "object") {
    const entry = detailMap[noteId];
    if (entry?.note && typeof entry.note === "object") {
      return entry.note;
    }
  }

  return (
    safeGet(decoded, "noteData.data.noteData") ||
    safeGet(decoded, "note.data") ||
    safeGet(decoded, "noteDetail.data") ||
    safeGet(decoded, "data.noteData")
  );
}

function extractInitialStateJson(html) {
  // 取到下一个 </script>，避免对大段 JSON 做错误的非贪婪 `}` 截断
  const re = /window\.__INITIAL_STATE__\s*=\s*(.*?)<\/script>/is;
  const m = html.match(re);
  if (m?.[1]) {
    return m[1].trim();
  }
  const legacy =
    /<script>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i.exec(
      html
    );
  return legacy?.[1]?.trim() ?? null;
}

async function xhs(url) {
  try {
    const { html, finalUrl } = await fetchXhsNoteHtml(url);

    if (!html) {
      return output(400, "请求失败");
    }

    if (
      !finalUrl.includes("xiaohongshu.com") &&
      !html.includes("__INITIAL_STATE__")
    ) {
      return output(
        400,
        "无法打开小红书笔记页，请确认短链有效或使用 App 分享链接"
      );
    }

    let jsonRaw = extractInitialStateJson(html);
    if (!jsonRaw) {
      return output(400, "未找到页面数据");
    }

    jsonRaw = jsonRaw.replace(/undefined/g, "null");

    let decoded;
    try {
      decoded = JSON.parse(jsonRaw);
    } catch {
      return output(400, "JSON数据解析失败");
    }

    if (!decoded || typeof decoded !== "object") {
      return output(400, "数据格式错误");
    }

    const noteData = resolveNotePayload(decoded);

    if (!noteData || typeof noteData !== "object") {
      return output(400, "数据结构不匹配，请检查链接是否为有效的小红书内容");
    }

    // 安全地构建基础数据
    const data = {
      author:
        safeGet(noteData, "user.nickName") ||
        safeGet(noteData, "user.nickname") ||
        safeGet(noteData, "user.name") ||
        "",
      authorID:
        safeGet(noteData, "user.userId") || safeGet(noteData, "user.id") || "",
      title: noteData.title || "",
      desc: noteData.desc || noteData.description || "",
      avatar:
        safeGet(noteData, "user.avatar") ||
        safeGet(noteData, "user.avatarUrl") ||
        "",
    };

    // 检查视频URL
    let videoUrl = null;
    const videoStream = safeGet(noteData, "video.media.stream");

    if (videoStream && typeof videoStream === "object") {
      // 尝试h265格式
      const h265List = videoStream.h265;
      if (Array.isArray(h265List) && h265List.length > 0 && h265List[0]) {
        videoUrl = h265List[0].masterUrl;
      }

      // 如果没有h265，尝试h264
      if (!videoUrl) {
        const h264List = videoStream.h264;
        if (Array.isArray(h264List) && h264List.length > 0 && h264List[0]) {
          videoUrl = h264List[0].masterUrl;
        }
      }
    }

    if (videoUrl) {
      // 视频内容
      data.cover = "";
      const imageList = noteData.imageList;
      if (Array.isArray(imageList) && imageList.length > 0 && imageList[0]) {
        const first = imageList[0];
        data.cover =
          first.urlDefault ||
          first.url ||
          safeGet(first, "infoList.0.url") ||
          "";
      }
      data.url = videoUrl;
      data.type = "video";
      return output(200, "解析成功", data);
    }

    // 检查图片内容
    const imageList = noteData.imageList;
    if (Array.isArray(imageList) && imageList.length > 0) {
      const images = [];
      let cover = "";

      for (let i = 0; i < imageList.length; i++) {
        const img = imageList[i];
        if (img && typeof img === "object") {
          let imageUrl =
            img.urlDefault ||
            img.url ||
            safeGet(img, "infoList.0.url");
          if (imageUrl) {
            images.push(imageUrl);
            if (i === 0) cover = imageUrl;
          }
        }
      }

      if (images.length > 0) {
        data.cover = cover;
        data.images = images;
        data.type = "image";
        return output(200, "解析成功", data);
      }
    }

    return output(404, "该内容不包含视频或图片");
  } catch (error) {
    return output(500, `服务器错误：${error.message || "未知错误"}`);
  }
}

export const GET = createApiHandler(xhs);
