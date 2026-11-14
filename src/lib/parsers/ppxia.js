/**
 * 皮皮虾解析（纯函数模块，无 HTTP 边界）
 * 由 /api/ppxia 路由与统一入口 /api/parse 直接函数调用；
 *
 * 2026-11-14 重写：原 cell_h5_comment 评论接口 hack 已失效——接口正常响应
 * （status_code 0）但 cell_comments: null，线上同一活跃链接用户重试 3 次全
 * 404。改为解析分享落地页 h5.pipix.com/ppx/item/<id> 内嵌的
 * <script id="RENDER_DATA">（Next SSR 约定：encodeURIComponent 后的 JSON），
 * 视频直链在 ppxItemDetail.item.video.{high,mid,low,download}.url_list，
 * 结构已在生产出口对活跃视频实测验证。
 */

import { logger } from "@/lib/api-utils";

const TIMEOUT = 8000;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function getRedirectUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return response.url;
  } catch (error) {
    logger.error("Error getting redirect URL:", error.message);
    throw new Error("获取重定向URL失败");
  }
}

/** 解码 RENDER_DATA script 内容为 JSON；不存在或非法返回 null */
function extractRenderData(html) {
  const match = html.match(/<script id="RENDER_DATA"[^>]*>([^<]+)</);
  if (!match) return null;
  try {
    // 先还原实体再解码：script 里的 & 可能被 SSR 转义成 &amp;
    return JSON.parse(decodeURIComponent(match[1].trim().replace(/&amp;/g, "&")));
  } catch (error) {
    logger.error("RENDER_DATA decode failed:", error.message);
    return null;
  }
}

/**
 * 从 item.video 里挑出带直链的清晰度：高/中/低清晰度对部分视频为 null，
 * video_download 是通用下载源（生产实测该字段最稳）。返回 { url, cover } 或 null。
 */
function pickVideo(item) {
  const video = item?.video;
  const rendition = [
    video?.video_high,
    video?.video_mid,
    video?.video_low,
    video?.video_download,
  ].find((v) => v?.url_list?.[0]?.url);
  if (!rendition) return null;
  return {
    url: rendition.url_list[0].url,
    cover: video?.cover_image?.url_list?.[0]?.url || "",
  };
}

async function ppxiaParse(url) {
  try {
    const redirectUrl = await getRedirectUrl(url);
    const idMatch = redirectUrl.match(/item\/([^?&]+)/);

    if (!idMatch?.[1]) {
      return { code: 400, msg: "无法从 URL 中提取视频 ID" };
    }

    const pageUrl = `https://h5.pipix.com/ppx/item/${idMatch[1]}`;
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": MOBILE_UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!response.ok) {
      return { code: response.status, msg: "上游页面请求失败" };
    }

    const html = await response.text();
    const renderData = extractRenderData(html);
    const item = renderData?.ppxItemDetail?.item;

    if (!item) {
      return { code: 404, msg: "未找到视频数据" };
    }

    const media = pickVideo(item);
    if (!media) {
      return { code: 404, msg: "视频地址不存在" };
    }

    return {
      code: 200,
      msg: "解析成功",
      data: {
        author: item.author?.name || "未知作者",
        avatar: item.author?.avatar?.url_list?.[0]?.url || "",
        title: item.content || "无标题",
        cover: media.cover,
        url: media.url,
      },
    };
  } catch (error) {
    logger.error("ppxia parse error:", error);
    return { code: 500, msg: "服务器内部错误" };
  }
}

export default ppxiaParse;
