// 共享的快手解析核心逻辑（供 Next 路由与 Cloudflare Workers 复用）

// Edge/Workers 环境不启用 DOM 解析，直接使用字符串/正则方案
async function initDOMParser() {
  return null;
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

    this.urlPatterns = [
      {
        name: "short-video",
        regex: /short-video\/([^?]+)/,
        template: (videoId) =>
          `https://www.kuaishou.com/short-video/${videoId}`,
      },
      {
        name: "photo",
        regex: /photo\/([^?]+)/,
        template: (videoId) =>
          `https://www.kuaishou.com/short-video/${videoId}`,
      },
      {
        name: "f-format",
        regex: /\/f\/([^?]+)/,
        template: (videoId, redirectUrl) => redirectUrl,
      },
      {
        name: "profile",
        regex: /profile\/([^?]+)/,
        template: (videoId, redirectUrl) => redirectUrl,
      },
      {
        name: "video",
        regex: /video\/([^?]+)/,
        template: (videoId, redirectUrl) => redirectUrl,
      },
    ];
  }

  async parse(url) {
    try {
      const redirectedUrl = await this.getRedirectedUrl(url);
      const { requestUrl } = this.parseUrl(url, redirectedUrl);
      const htmlContent = await this.fetchPageContent(requestUrl, url);
      if (!htmlContent) return null;

      const videoInfo = await this.parseVideoInfo(htmlContent);
      return videoInfo;
    } catch {
      return null;
    }
  }

  parseUrl(originalUrl, redirectedUrl) {
    let videoId = "";
    let requestUrl = redirectedUrl;
    for (const pattern of this.urlPatterns) {
      const match =
        originalUrl.match(pattern.regex) || redirectedUrl.match(pattern.regex);
      if (match) {
        videoId = match[1];
        requestUrl = pattern.template(videoId, redirectedUrl);
        break;
      }
    }
    return { requestUrl };
  }

  async getRedirectedUrl(url) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": this.headers["User-Agent"] },
        signal: AbortSignal.timeout(10000),
      });
      return response.url || url;
    } catch {
      return url;
    }
  }

  async fetchPageContent(primaryUrl, fallbackUrl) {
    let content = await this.makeRequest(primaryUrl);
    if (!content && fallbackUrl !== primaryUrl) {
      content = await this.makeRequest(fallbackUrl);
    }
    return content;
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

  async parseVideoInfo(htmlContent) {
    try {
      const domParser = await initDOMParser();
      if (domParser) {
        const result = await this.parseWithDOM(htmlContent, domParser);
        if (result) return result;
      }
      let result = this.parseApolloStateRegex(htmlContent);
      if (result) return result;
      result = this.parseInlineJsonData(htmlContent);
      if (result) return result;
      result = this.parseWithRegexFallback(htmlContent);
      if (result) return result;
      result = this.parseWithBroadSearch(htmlContent);
      if (result) return result;
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
        if (matches) {
          for (const url of matches.slice(0, 10)) {
            if (this.isValidVideoUrl(url)) {
              const videoData = { photoUrl: url, source: "broad-search" };
              this.extractAdditionalInfo(htmlContent, videoData);
              return formatResponse(200, "解析成功", videoData);
            }
          }
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
