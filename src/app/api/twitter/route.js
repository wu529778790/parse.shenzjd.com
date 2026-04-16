import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";
import { getRedirectLocation } from "@/lib/redirect-location";

export const runtime = "nodejs";

function getTwitterToken(idStr) {
  const num = parseFloat(idStr);
  if (!Number.isFinite(num)) {
    return "";
  }
  const token = (num / 1e15) * Math.PI;
  let tokenStr = token.toString();
  if (tokenStr.includes("e") || tokenStr.includes("E")) {
    tokenStr = token.toFixed(16).replace(/\.?0+$/, "");
  }
  return tokenStr.replace(/0/g, "").replace(/\./g, "");
}

function extractTweetId(shareUrl) {
  const re = /(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i;
  const m = shareUrl.match(re);
  return m?.[1] || "";
}

async function parseVideoId(tweetId) {
  const token = getTwitterToken(tweetId);
  const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://platform.twitter.com/",
    },
  });
  if (!res.ok) {
    return { code: res.status, msg: "Twitter syndication 请求失败" };
  }
  const json = await res.json();

  const authorName = json.user?.name || "";
  const authorScreenName = json.user?.screen_name || "";
  const authorAvatar = json.user?.profile_image_url_https || "";
  const authorId = json.user?.id_str || "";
  const title = json.text || "";

  let videoUrl = "";
  let coverUrl = "";
  const images = [];

  const mediaDetails = json.mediaDetails;
  if (Array.isArray(mediaDetails)) {
    for (const media of mediaDetails) {
      const mediaType = media.type;
      if (mediaType === "video" || mediaType === "animated_gif") {
        coverUrl = media.media_url_https || "";
        const variants = media.video_info?.variants || [];
        let maxBitrate = 0;
        for (const v of variants) {
          if (v.content_type !== "video/mp4") continue;
          const br = v.bitrate || 0;
          const u = v.url || "";
          if (u && (br > maxBitrate || !videoUrl)) {
            maxBitrate = br;
            videoUrl = u;
          }
        }
        break;
      }
    }
  }

  if (!videoUrl && json.video?.variants) {
    coverUrl = json.video.poster || coverUrl;
    let maxBitrate = 0;
    for (const v of json.video.variants) {
      if (v.content_type !== "video/mp4") continue;
      const br = v.bitrate || 0;
      const u = v.url || "";
      if (u && (br > maxBitrate || !videoUrl)) {
        maxBitrate = br;
        videoUrl = u;
      }
    }
  }

  if (!videoUrl && Array.isArray(mediaDetails)) {
    for (const media of mediaDetails) {
      if (media.type === "photo" && media.media_url_https) {
        images.push(media.media_url_https);
      }
    }
    if (images.length > 0) {
      coverUrl = images[0];
    }
  }

  if (!videoUrl && images.length === 0) {
    return { code: 404, msg: "该推文中没有找到视频或图片" };
  }

  const displayName = authorName || authorScreenName;

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title,
      author: displayName,
      avatar: authorAvatar,
      uid: authorId,
      cover: coverUrl,
      url: videoUrl,
      images: images.length > 0 ? images : undefined,
    },
  };
}

async function twitterParse(shareUrl) {
  let url = shareUrl;
  if (url.includes("t.co/")) {
    const loc = await getRedirectLocation(url, {
      "User-Agent": DEFAULT_MOBILE_UA,
    });
    if (!loc) {
      return { code: 400, msg: "t.co 短链解析失败" };
    }
    url = loc;
  }

  const tweetId = extractTweetId(url);
  if (!tweetId) {
    return { code: 400, msg: "无法从 URL 提取推文 ID" };
  }
  return parseVideoId(tweetId);
}

export const GET = createApiHandler(twitterParse);
