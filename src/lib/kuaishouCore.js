// 共享的快手解析核心逻辑（供 Next 路由与 Cloudflare Workers 复用）
//
// 关键结论（2026-09-23 线上日志 + 实测）：
// 快手站点对「移动 UA 访问 PC 页面」会直接返回 63 字节反爬 JSON
// （{"result":2,"error_msg":null,...}），页面里没有任何媒体数据——这正是
// www.kuaishou.com/f/<token> 长链反复「解析失败（无返回结果）」的根因：
//   短链 v.kuaishou.com/x → 302 → m.chenzhongtech.com/fw/photo/<id>（移动分享页）
//   长链 www.kuaishou.com/f/x → 302 → www.kuaishou.com/short-video/<id>（PC 页，被反爬）
// 而原来的 urlPatterns 会把「/fw/photo/<id>」也重写成 www.kuaishou.com/short-video/<id>，
// 等于把唯一能解析的移动页主动换成被反爬的 PC 页——实测 4 个线上链接全部命中该坑。
// 现在统一只请求移动端分享页（m.gifshow.com/fw/photo/<id>，实测 160KB 完整数据），
// 并把重定向拿到的原移动页作为备用候选。
//
// 兜底链路（lib/douyinFallback.js public17Parse）对 /f/ 与 /short-video/ 一律返回
// 5001「快手可能触发风控」，只认 v.kuaishou.com 短链，所以主解析必须自己修好。

// 移动端分享页：快手 H5 分享落地页，含 mainMvUrls（无水印 mp4 直链）
const MOBILE_SHARE_BASE = "https://m.gifshow.com/fw/photo/";

// Edge/Workers 环境不启用 DOM 解析，直接使用字符串/正则方案
async function initDOMParser() {
  return null;
}

/**
 * 从任意快手链接里抠出 photoId。
 * 覆盖短链展开后的 /short-video/<id>、移动分享页 /fw/photo/<id>、
 * 以及历史形态 /photo/<id>（注意 /photo/ 不能误匹配 /fw/photo/ 之外的东西）。
 */
export function extractKuaishouPhotoId(url) {
  if (!url || typeof url !== "string") return "";
  const match = url.match(/(?:short-video|fw\/photo|photo)\/([^?/#]+)/);
  return match ? match[1] : "";
}

export function formatResponse(code = 200, msg = "解析成功", data = []) {
  return {
    code,
    msg,
    data,
    platform: "kuaishou",
  };
}

class KuaishouParser {
  constructor() {
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
  }

  /**
   * 移动端分享页把媒体数据塞在 JS 字符串里（形如 `\"caption\":\"...\"`、
   * `mainMvUrls\":[{\"url\":\"https://...mp4\"`），字段名带反斜杠转义，
   * 直接跑原有的正则一律匹配不到（不是没有数据，是转义挡住了）。
   * 这里做一份「解除 JSON 字符串转义」的副本参与解析，让既有正则分支重新生效
   * （顺带把标题/封面也捞出来）。
   */
  unescapeEmbeddedJson(html) {
    return html
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"');
  }

  /**
   * 依次请求候选页，返回第一个能解析出结果的：
   * 移动分享页（主）→ 重定向拿到的原移动页（备）→ 兜底 URL。
   * 注意候选必须逐一「请求 + 解析」，不能像旧实现那样「只请求第一个、
   * 解析失败就算了」——反爬页能返回 200 但内容里没有数据。
   */
  async parse(url) {
    try {
      const redirectedUrl = await this.getRedirectedUrl(url);
      const { candidates } = this.parseUrl(url, redirectedUrl);
      for (const candidate of candidates) {
        const htmlContent = await this.makeRequest(candidate);
        if (!htmlContent) continue;
        const videoInfo = await this.parseVideoInfo(htmlContent);
        if (videoInfo) return videoInfo;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 计算请求候选列表：photoId 能抠出来就请求移动分享页（唯一稳定可解析的形态），
   * 抠不出来（如 profile 主页链接）才退回重定向后的原地址。
   */
  parseUrl(originalUrl, redirectedUrl) {
    const photoId =
      extractKuaishouPhotoId(redirectedUrl) ||
      extractKuaishouPhotoId(originalUrl);
    if (!photoId) {
      return { videoId: "", candidates: [redirectedUrl].filter(Boolean) };
    }

    const viaMobile = `${MOBILE_SHARE_BASE}${photoId}`;
    // 重定向本身已经落在移动分享页（v.kuaishou.com 短链的常见形态）时优先原样用
    const direct = /\/fw\/photo\//.test(redirectedUrl) ? redirectedUrl : "";
    const candidates = [direct || viaMobile, viaMobile, redirectedUrl].filter(
      Boolean
    );
    return { videoId: photoId, candidates: [...new Set(candidates)] };
  }

  async getRedirectedUrl(url) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: this.headers,
        signal: AbortSignal.timeout(10000),
      });
      return response.url || url;
    } catch {
      return url;
    }
  }

  async makeRequest(url) {
    try {
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const text = await response.text();
      return text;
    } catch {
      return null;
    }
  }

  /**
   * 移动端分享页的媒体数据是「转义过的 JSON 片段」，字段名固定：
   *   mainMvUrls":[{"cdn":"...","url":"https://....mp4..."}]   主视频（mp4）
   *   coverUrls / webpCoverUrls":[{"url":"https://....jpg"}]   封面
   *   caption":"..." / name":"..."                             文案 / 作者
   * 按字段精确取值，比宽正则准：宽正则会先撞上页面更靠前的 HLS(m3u8)，
   * 并把作者头像（/uhead/）当成封面。
   */
  extractArrayFieldUrl(text, fieldName) {
    const idx = text.indexOf(`"${fieldName}":`);
    if (idx < 0) return "";
    const match = text
      .slice(idx, idx + 2000)
      .match(/"url"\s*:\s*"([^"]+)"/);
    if (!match) return "";
    return this.cleanUrl(match[1]).replace(/^http:/i, "https:");
  }

  parseMobileSharePayload(htmlContent) {
    try {
      const text = this.unescapeEmbeddedJson(htmlContent);
      if (!text.includes('"mainMvUrls":')) return null;
      const videoUrl = this.extractArrayFieldUrl(text, "mainMvUrls");
      if (!videoUrl) return null;

      const data = { photoUrl: videoUrl, source: "mobile-share-json" };
      const cover =
        this.extractArrayFieldUrl(text, "webpCoverUrls") ||
        this.extractArrayFieldUrl(text, "coverUrls");
      if (cover) data.coverUrl = cover;

      const caption = (text.match(/"caption"\s*:\s*"([^"]*)"/) || [])[1];
      if (caption && !caption.includes("原声")) data.caption = caption;
      const author = (text.match(/"name"\s*:\s*"([^"]*)"/) || [])[1];
      if (author && !author.includes("原声")) data.authorName = author;

      return formatResponse(200, "解析成功", data);
    } catch {
      return null;
    }
  }

  async parseVideoInfo(htmlContent) {
    try {
      // 先用原样 HTML 跑一遍，再用「解除转义」的副本跑一遍：
      // 移动端分享页的数据是转义过的，只有副本能让既有正则分支命中。
      const variants = [htmlContent, this.unescapeEmbeddedJson(htmlContent)];
      for (const html of variants) {
        // 快手自有字段优先（最准），命中即返回
        const mobile = this.parseMobileSharePayload(html);
        if (mobile) return mobile;

        const domParser = await initDOMParser();
        if (domParser) {
          const result = await this.parseWithDOM(html, domParser);
          if (result) return result;
        }
        let result = this.parseApolloStateRegex(html);
        if (result) return result;
        result = this.parseInlineJsonData(html);
        if (result) return result;
        result = this.parseWithRegexFallback(html);
        if (result) return result;
        result = this.parseWithBroadSearch(html);
        if (result) return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  parseWithDOM(htmlContent, DOMParserClass) {
    try {
      const parser = new DOMParserClass();
      const document = parser.parseFromString(htmlContent, "text/html");
      let result = this.parseApolloState(document);
      if (result) return result;
      result = this.parseScriptData(document);
      if (result) return result;
      result = this.parseMetaTags(document);
      if (result) return result;
      return null;
    } catch {
      return null;
    }
  }

  parseApolloStateRegex(htmlContent) {
    try {
      const apolloStatePattern =
        /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?})(?:\s*;|\s*<\/script>)/;
      const matches = htmlContent.match(apolloStatePattern);
      if (matches) {
        try {
          let apolloStateStr = matches[1];
          apolloStateStr = this.cleanJsonString(apolloStateStr);
          const apolloState = JSON.parse(apolloStateStr);
          const defaultClient = apolloState.defaultClient || apolloState;
          if (defaultClient) {
            const result = this.extractVideoDataFromApolloState(defaultClient);
            if (result) return result;
          }
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  parseWithRegexFallback(htmlContent) {
    try {
      const regexPatterns = [
        /"photoUrl":\s*"([^"]+)"/,
        /"playUrl":\s*"([^"]+)"/,
        /"videoUrl":\s*"([^"]+)"/,
        /"mp4Url":\s*"([^"]+)"/,
        /photoUrl['"]\s*:\s*['"]([^'"]+)['"]/,
        /playUrl['"]\s*:\s*['"]([^'"]+)['"]/,
      ];
      for (const pattern of regexPatterns) {
        const match = htmlContent.match(pattern);
        if (match) {
          let videoUrl = match[1];
          videoUrl = this.cleanUrl(videoUrl);
          if (videoUrl.startsWith("http")) {
            const contextData = {
              photoUrl: videoUrl,
              source: "regex-fallback",
            };
            this.extractAdditionalInfo(htmlContent, contextData);
            return formatResponse(200, "解析成功", contextData);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  parseApolloState(document) {
    try {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        if (content.includes("__APOLLO_STATE__")) {
          const apolloStateMatch = content.match(
            /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?})(?:\s*;|\s*<\/script>)/
          );
          if (apolloStateMatch) {
            try {
              const apolloStateStr = this.cleanJsonString(apolloStateMatch[1]);
              const apolloState = JSON.parse(apolloStateStr);
              const defaultClient = apolloState.defaultClient || apolloState;
              if (defaultClient) {
                const result =
                  this.extractVideoDataFromApolloState(defaultClient);
                if (result) return result;
              }
            } catch {}
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  parseScriptData(document) {
    try {
      const scripts = document.querySelectorAll("script");
      const dataPatterns = [
        {
          name: "INITIAL_STATE",
          pattern: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
        },
        { name: "NUXT", pattern: /window\.__NUXT__\s*=\s*({[\s\S]*?});/ },
        { name: "videoDetail", pattern: /"videoDetail":\s*({[\s\S]*?})/ },
        { name: "photoInfo", pattern: /"photoInfo":\s*({[\s\S]*?})/ },
      ];
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        for (const { pattern } of dataPatterns) {
          const match = content.match(pattern);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              const result = this.findVideoDataDeep(data);
              if (result) return result;
            } catch {}
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  parseInlineJsonData(htmlContent) {
    try {
      const jsonPatterns = [
        { name: "photoUrl", pattern: /"photoUrl":\s*"([^"]+)"/ },
        { name: "playUrl", pattern: /"playUrl":\s*"([^"]+)"/ },
        { name: "videoUrl", pattern: /"videoUrl":\s*"([^"]+)"/ },
        { name: "mp4Url", pattern: /"mp4Url":\s*"([^"]+)"/ },
      ];
      for (const { name, pattern } of jsonPatterns) {
        const match = htmlContent.match(pattern);
        if (match) {
          let videoUrl = this.cleanUrl(match[1]);
          if (videoUrl.startsWith("http")) {
            const videoData = {
              photoUrl: videoUrl,
              source: `inline-json-${name}`,
            };
            this.extractAdditionalInfo(htmlContent, videoData);
            return formatResponse(200, "解析成功", videoData);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  parseMetaTags(document) {
    try {
      const videoData = {};
      const metaTags = document.querySelectorAll("meta");
      for (const meta of metaTags) {
        const property =
          meta.getAttribute("property") || meta.getAttribute("name");
        const content = meta.getAttribute("content");
        if (!property || !content) continue;
        if (property === "og:video" || property === "og:video:url") {
          videoData.photoUrl = content;
        } else if (property === "og:image") {
          videoData.coverUrl = content;
        } else if (property === "og:title" || property === "og:description") {
          videoData.title = content;
        }
        if (property.includes("video") && content.startsWith("http")) {
          videoData.photoUrl = content;
        }
      }
      if (videoData.photoUrl) {
        videoData.source = "meta-tags";
        return formatResponse(200, "解析成功", videoData);
      }
      return null;
    } catch {
      return null;
    }
  }

  extractVideoDataFromApolloState(apolloState) {
    const videoKeys = Object.keys(apolloState).filter(
      (key) =>
        key.includes("Photo") || key.includes("Video") || key.includes("Detail")
    );
    for (const key of videoKeys) {
      const data = apolloState[key];
      if (data && typeof data === "object") {
        const result = this.extractVideoDataFromObject(data);
        if (result) return result;
      }
    }
    const deepResult = this.findVideoDataDeep(apolloState);
    if (deepResult) return deepResult;
    return null;
  }

  extractVideoDataFromObject(obj) {
    if (!obj || typeof obj !== "object") return null;
    const videoUrl =
      obj.photoUrl || obj.playUrl || obj.videoUrl || obj.mp4Url || obj.src;
    if (
      videoUrl &&
      typeof videoUrl === "string" &&
      videoUrl.startsWith("http")
    ) {
      const result = { photoUrl: videoUrl, source: "apollo-state-object" };
      this.mapObjectFields(obj, result);
      return formatResponse(200, "解析成功", result);
    }
    return null;
  }

  mapObjectFields(source, target) {
    const fieldMappings = {
      caption: "caption",
      title: "title",
      coverUrl: "coverUrl",
      cover: "coverUrl",
      poster: "coverUrl",
      thumbnail: "coverUrl",
      previewUrl: "coverUrl",
      name: "authorName",
      author: "author",
      headUrl: "authorAvatar",
      avatar: "avatar",
      likeCount: "likeCount",
      like: "like",
      commentCount: "commentCount",
      shareCount: "shareCount",
      playCount: "playCount",
      duration: "duration",
      createTime: "createTime",
      timestamp: "timestamp",
    };
    for (const [sourceKey, targetKey] of Object.entries(fieldMappings)) {
      if (source[sourceKey] !== undefined) {
        target[targetKey] = source[sourceKey];
      }
    }
  }

  findVideoDataDeep(obj, depth = 0) {
    if (depth > 6) return null;
    if (!obj || typeof obj !== "object") return null;
    const directResult = this.extractVideoDataFromObject(obj);
    if (directResult) return directResult;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        try {
          const result = this.findVideoDataDeep(obj[key], depth + 1);
          if (result) return result;
        } catch {}
      }
    }
    return null;
  }

  extractAdditionalInfo(htmlContent, videoData) {
    const allImages = htmlContent.match(
      /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
    );
    const coverPatterns = [
      /"coverUrl":\s*"([^"]+)"/,
      /"cover":\s*"([^"]+)"/,
      /"poster":\s*"([^"]+)"/,
      /"thumbnail":\s*"([^"]+)"/,
      /"previewUrl":\s*"([^"]+)"/,
      /"imageUrl":\s*"([^"]+)"/,
    ];
    for (const pattern of coverPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        let coverUrl = this.cleanUrl(match[1]);
        if (coverUrl.startsWith("http") && this.isSimpleImageUrl(coverUrl)) {
          videoData.coverUrl = coverUrl;
          break;
        }
      }
    }
    if (!videoData.coverUrl && allImages) {
      for (const imageUrl of allImages) {
        const cleanUrl = this.cleanUrl(imageUrl);
        if (this.isKuaishouImageUrl(cleanUrl)) {
          videoData.coverUrl = cleanUrl;
          break;
        }
      }
      if (!videoData.coverUrl) {
        for (const imageUrl of allImages.slice(0, 15)) {
          const cleanUrl = this.cleanUrl(imageUrl);
          if (this.looksLikeCover(cleanUrl)) {
            videoData.coverUrl = cleanUrl;
            break;
          }
        }
      }
      if (!videoData.coverUrl && allImages.length > 0) {
        const firstImage = this.cleanUrl(allImages[0]);
        if (this.isReasonableImage(firstImage)) {
          videoData.coverUrl = firstImage;
        }
      }
    }
    const captionMatch = htmlContent.match(/"caption":\s*"([^"]+)"/);
    if (captionMatch) videoData.caption = captionMatch[1];
    const authorMatch = htmlContent.match(/"name":\s*"([^"]+)"/);
    if (authorMatch && !authorMatch[1].includes("原声"))
      videoData.authorName = authorMatch[1];
  }

  isSimpleImageUrl(url) {
    if (!url || !url.startsWith("http")) return false;
    return url.toLowerCase().match(/\.(jpg|jpeg|png|webp)/);
  }
  isKuaishouImageUrl(url) {
    if (!url || !url.startsWith("http")) return false;
    const urlLower = url.toLowerCase();
    const kuaishouDomains = ["kwimgs.com", "kwaicdn.com", "kuaishou.com"];
    const isKuaishouDomain = kuaishouDomains.some((domain) =>
      urlLower.includes(domain)
    );
    if (!isKuaishouDomain) return false;
    const excludeKeywords = [
      "icon",
      "logo",
      "button",
      "menu",
      "ui",
      "asset",
      "sprite",
    ];
    const hasExcludeKeyword = excludeKeywords.some((keyword) =>
      urlLower.includes(keyword)
    );
    return !hasExcludeKeyword;
  }
  looksLikeCover(url) {
    if (!url || !url.startsWith("http")) return false;
    const urlLower = url.toLowerCase();
    const excludeKeywords = [
      "icon",
      "logo",
      "button",
      "menu",
      "ui",
      "asset",
      "avatar",
      "user",
      "profile",
      "head",
      "background",
      "bg",
      "sprite",
      "line-up",
      "arrow",
      "close",
      "play-btn",
    ];
    const hasExcludeKeyword = excludeKeywords.some((keyword) =>
      urlLower.includes(keyword)
    );
    if (hasExcludeKeyword) return false;
    return urlLower.match(/\.(jpg|jpeg|png|webp)/);
  }
  isReasonableImage(url) {
    if (!url || !url.startsWith("http")) return false;
    const urlLower = url.toLowerCase();
    if (!urlLower.match(/\.(jpg|jpeg|png|webp)/)) return false;
    const unreasonableKeywords = [
      "data:image",
      "base64",
      "1x1",
      "pixel",
      "tracking",
    ];
    return !unreasonableKeywords.some((keyword) => urlLower.includes(keyword));
  }
  cleanJsonString(jsonStr) {
    try {
      return jsonStr
        .replace(/function\s*\([^)]*\)\s*{[^{}]*(?:{[^{}]*}[^{}]*)*}/g, "null")
        .replace(/:\s*undefined/g, ":null")
        .replace(/,\s*undefined/g, ",null")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/,\s*(?=})/g, "")
        .replace(/,\s*(?=])/g, "")
        .replace(/new\s+Date\([^)]*\)/g, "null")
        .replace(/Symbol\([^)]*\)/g, "null")
        .replace(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)/g, "null")
        .replace(/(['"])??([a-zA-Z0-9_]+)(['"])??:/g, '"$2":');
    } catch {
      return jsonStr;
    }
  }
  cleanUrl(url) {
    return url
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");
  }
  isValidImageUrl(url) {
    return (
      url.startsWith("http") &&
      (url.includes(".jpg") ||
        url.includes(".jpeg") ||
        url.includes(".png") ||
        url.includes(".webp") ||
        url.includes("image") ||
        url.includes("cover") ||
        url.includes("thumb"))
    );
  }
  parseWithBroadSearch(htmlContent) {
    try {
      const broadPatterns = [
        /https?:\/\/[^"'\s]+\.(?:mp4|m3u8|flv|avi|mov|wmv|mkv)(?:[^"'\s]*)?/gi,
        /https?:\/\/[^"'\s]*(?:video|media|stream|play|cdn)[^"'\s]*\.(?:mp4|m3u8|flv)/gi,
        /https?:\/\/[^"'\s]*(?:kuaishou|kwai|ks)[^"'\s]*\.(mp4|m3u8|flv)/gi,
        /https?:\/\/[^"'\s]+(?:play|stream|video)[^"'\s]*/gi,
      ];
      for (const pattern of broadPatterns) {
        const matches = htmlContent.match(pattern);
        if (!matches) continue;
        // 必须过 cleanUrl：转义过的页面里 URL 后面紧跟 `\"`，
        // 宽正则会把结尾的反斜杠一起吃进来，直接当直链用会让播放器 404
        const urls = matches
          .slice(0, 20)
          .map((raw) => this.cleanUrl(raw))
          .filter((url) => this.isValidVideoUrl(url));
        // mp4 优先于 HLS(m3u8)：桌面 Chrome 的 <video> 播不了 m3u8，
        // 而页面里 HLS 地址通常排在 mp4 前面，不挑就会拿到不可播的那个
        const url =
          urls.find((u) => /\.mp4(\?|$)/i.test(u)) ||
          urls.find((u) => !/\.m3u8/i.test(u)) ||
          urls[0];
        if (url) {
          const videoData = { photoUrl: url, source: "broad-search" };
          this.extractAdditionalInfo(htmlContent, videoData);
          return formatResponse(200, "解析成功", videoData);
        }
      }
      return this.extractFromJsonFragments(htmlContent);
    } catch {
      return null;
    }
  }
  extractEnhancedInfo(htmlContent, videoData) {
    // 保留占位，核心逻辑已在 extractAdditionalInfo 覆盖
    return videoData;
  }
  isValidCoverUrl(url) {
    const lower = (url || "").toLowerCase();
    return lower.startsWith("http") && /\.(jpg|jpeg|png|webp)/.test(lower);
  }
  extractFromJsonFragments(htmlContent) {
    try {
      const jsonPatterns = [
        /\{[^{}]*"(?:photoUrl|playUrl|videoUrl|mp4Url)"[^{}]*\}/g,
        /\{[^{}]*"url":\s*"https?:\/\/[^\"]*\.(?:mp4|m3u8|flv)[^\"]*"[^{}]*\}/g,
        /\{[^{}]*"src":\s*"https?:\/\/[^\"]*\.(?:mp4|m3u8|flv)[^\"]*"[^{}]*\}/g,
      ];
      for (const pattern of jsonPatterns) {
        const matches = htmlContent.match(pattern);
        if (matches) {
          for (const jsonStr of matches.slice(0, 5)) {
            try {
              const data = JSON.parse(jsonStr);
              const videoUrl =
                data.photoUrl ||
                data.playUrl ||
                data.videoUrl ||
                data.mp4Url ||
                data.url ||
                data.src;
              if (videoUrl && this.isValidVideoUrl(videoUrl)) {
                return formatResponse(200, "解析成功", {
                  photoUrl: videoUrl,
                  source: "json-fragment",
                  ...data,
                });
              }
            } catch {}
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  isValidVideoUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (!url.startsWith("http")) return false;
    const videoIndicators = [
      ".mp4",
      ".m3u8",
      ".flv",
      ".avi",
      ".mov",
      ".wmv",
      ".mkv",
      "video",
      "play",
      "stream",
      "media",
    ];
    return videoIndicators.some((indicator) =>
      url.toLowerCase().includes(indicator)
    );
  }
}

export async function parseKuaishou(url) {
  const parser = new KuaishouParser();
  return await parser.parse(url);
}
