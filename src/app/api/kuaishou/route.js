import { parseKuaishou, formatResponse } from "@/lib/kuaishouCore";
export const runtime = "edge";

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
      console.log("原始URL:", url);

      // 获取重定向后的URL
      const redirectedUrl = await this.getRedirectedUrl(url);
      console.log("重定向后的URL:", redirectedUrl);

      // 解析URL获取请求URL
      const { requestUrl } = this.parseUrl(url, redirectedUrl);

      // 获取页面内容
      const htmlContent = await this.fetchPageContent(requestUrl, url);
      if (!htmlContent) {
        throw new Error("无法获取页面内容");
      }

      console.log("获取到页面内容，长度:", htmlContent.length);

      // 解析视频信息
      const videoInfo = await this.parseVideoInfo(htmlContent);

      return videoInfo;
    } catch (error) {
      console.log("解析失败:", error);
      return null;
    }
  }

  parseUrl(originalUrl, redirectedUrl) {
    let videoId = "";
    let requestUrl = redirectedUrl;
    let matchedPattern = null;

    // 尝试匹配不同的URL格式
    for (const pattern of this.urlPatterns) {
      const match =
        originalUrl.match(pattern.regex) || redirectedUrl.match(pattern.regex);
      if (match) {
        videoId = match[1];
        requestUrl = pattern.template(videoId, redirectedUrl);
        matchedPattern = pattern.name;
        console.log(
          `匹配到${pattern.name}格式，ID: ${videoId}, 请求URL: ${requestUrl}`
        );
        break;
      }
    }

    if (!matchedPattern) {
      console.log("未匹配到任何已知格式，使用重定向URL");
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
      console.log("重定向响应状态:", response.status);
      return response.url || url;
    } catch (error) {
      console.log("获取重定向URL失败:", error);
      return url;
    }
  }

  async fetchPageContent(primaryUrl, fallbackUrl) {
    // 先尝试主URL
    let content = await this.makeRequest(primaryUrl);

    // 如果失败，尝试备用URL
    if (!content && fallbackUrl !== primaryUrl) {
      console.log("第一次请求失败，尝试原始URL");
      content = await this.makeRequest(fallbackUrl);
    }

    return content;
  }

  async makeRequest(url) {
    try {
      console.log("请求URL:", url);
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(15000),
      });

      console.log("响应状态:", response.status);

      if (!response.ok) {
        console.log("请求失败，状态码:", response.status);
        return null;
      }

      const text = await response.text();
      console.log("响应内容长度:", text.length);
      return text;
    } catch (error) {
      console.log("请求错误:", error.message);
      return null;
    }
  }

  async parseVideoInfo(htmlContent) {
    try {
      console.log("=== 开始解析视频信息 ===");

      // 添加调试信息 - 专门搜索封面
      console.log("=== 调试：搜索页面中所有图片URL ===");
      const allImageUrls = htmlContent.match(
        /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
      );
      if (allImageUrls) {
        console.log(`总共找到 ${allImageUrls.length} 个图片URL:`);

        // 特别关注快手域名的图片
        const kuaishouImages = allImageUrls.filter(
          (url) =>
            url.toLowerCase().includes("kwimgs") ||
            url.toLowerCase().includes("kwaicdn") ||
            url.toLowerCase().includes("kuaishou")
        );
        console.log(`快手CDN图片 ${kuaishouImages.length} 个:`, kuaishouImages);

        // 显示所有图片的前几个
        allImageUrls.slice(0, 8).forEach((url, index) => {
          console.log(`图片 ${index + 1}: ${url}`);
        });
      }

      // 查找所有可能包含视频信息的字符串
      const videoPatterns = [
        /photoUrl/gi,
        /playUrl/gi,
        /videoUrl/gi,
        /mp4Url/gi,
        /__APOLLO_STATE__/gi,
        /__INITIAL_STATE__/gi,
        /__NUXT__/gi,
        /window\./gi,
        /\.mp4/gi,
        /\.m3u8/gi,
        /https?:\/\/[^"'\s]*\.(mp4|m3u8|flv)/gi,
      ];

      console.log("=== 搜索页面中的关键字 ===");
      for (const pattern of videoPatterns) {
        const matches = htmlContent.match(pattern);
        if (matches) {
          console.log(`找到 ${pattern.source}: ${matches.length} 个匹配`);
          if (pattern.source.includes("http")) {
            console.log("视频URL匹配:", matches.slice(0, 3)); // 只显示前3个
          }
        }
      }

      // 查找script标签中的内容类型
      console.log("=== 分析script标签内容 ===");
      const scriptMatches = htmlContent.matchAll(
        /<script[^>]*>([\s\S]*?)<\/script>/gi
      );
      let scriptIndex = 0;
      for (const scriptMatch of scriptMatches) {
        const scriptContent = scriptMatch[1];
        if (scriptContent.length > 100) {
          // 只分析有实际内容的script
          console.log(`Script ${scriptIndex} 长度: ${scriptContent.length}`);
          console.log(
            `Script ${scriptIndex} 前100字符:`,
            scriptContent.substring(0, 100)
          );

          // 检查是否包含视频相关数据
          if (
            scriptContent.includes("photoUrl") ||
            scriptContent.includes("playUrl") ||
            scriptContent.includes("videoUrl") ||
            scriptContent.includes(".mp4") ||
            scriptContent.includes(".m3u8")
          ) {
            console.log(`*** Script ${scriptIndex} 可能包含视频数据 ***`);
            console.log("内容片段:", scriptContent.substring(0, 300));
          }
        }
        scriptIndex++;
        if (scriptIndex > 10) break; // 限制输出数量
      }

      // 方法1: 优先使用DOM解析器（如果可用）
      const domParser = await initDOMParser();
      if (domParser) {
        console.log("使用DOM解析器");
        const result = await this.parseWithDOM(htmlContent, domParser);
        if (result) return result;
      } else {
        console.log("DOM解析器不可用，跳过DOM解析");
      }

      // 方法2: 使用正则表达式解析APOLLO_STATE
      console.log("尝试正则表达式解析APOLLO_STATE");
      let result = this.parseApolloStateRegex(htmlContent);
      if (result) return result;

      // 方法3: 解析内联JSON数据
      console.log("尝试解析内联JSON数据");
      result = this.parseInlineJsonData(htmlContent);
      if (result) return result;

      // 方法4: 正则表达式fallback
      console.log("尝试正则表达式fallback");
      result = this.parseWithRegexFallback(htmlContent);
      if (result) return result;

      // 方法5: 新增广泛搜索
      console.log("尝试广泛搜索方法");
      result = this.parseWithBroadSearch(htmlContent);
      if (result) return result;

      console.log("所有解析方法都失败了");
      return null;
    } catch (error) {
      console.log("parseVideoInfo错误:", error);
      return null;
    }
  }

  parseWithDOM(htmlContent, DOMParserClass) {
    try {
      const parser = new DOMParserClass();
      const document = parser.parseFromString(htmlContent, "text/html");

      console.log(
        "DOM解析成功，查找script标签数量:",
        document.querySelectorAll("script").length
      );

      // 方法1: 解析APOLLO_STATE
      let result = this.parseApolloState(document);
      if (result) return result;

      // 方法2: 解析其他脚本数据
      result = this.parseScriptData(document);
      if (result) return result;

      // 方法3: 提取meta标签信息
      result = this.parseMetaTags(document);
      if (result) return result;

      return null;
    } catch (error) {
      console.log("DOM解析失败:", error);
      return null;
    }
  }

  parseApolloStateRegex(htmlContent) {
    try {
      console.log("尝试正则表达式解析APOLLO_STATE");
      const apolloStatePattern =
        /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?})(?:\s*;|\s*<\/script>)/;
      const matches = htmlContent.match(apolloStatePattern);

      if (matches) {
        console.log("找到APOLLO_STATE");
        try {
          let apolloStateStr = matches[1];
          console.log("原始APOLLO_STATE长度:", apolloStateStr.length);

          apolloStateStr = this.cleanJsonString(apolloStateStr);
          console.log("清理后APOLLO_STATE长度:", apolloStateStr.length);

          const apolloState = JSON.parse(apolloStateStr);
          const defaultClient = apolloState.defaultClient || apolloState;

          if (defaultClient) {
            console.log("成功解析APOLLO_STATE，查找视频数据...");
            const result = this.extractVideoDataFromApolloState(defaultClient);
            if (result) {
              console.log("从APOLLO_STATE找到视频数据");
              return result;
            }
          }
        } catch (parseError) {
          console.log("解析APOLLO_STATE失败:", parseError.message);
        }
      } else {
        console.log("未找到APOLLO_STATE");
      }

      return null;
    } catch (error) {
      console.log("parseApolloStateRegex错误:", error);
      return null;
    }
  }

  parseWithRegexFallback(htmlContent) {
    try {
      console.log("使用正则表达式fallback");

      // 直接匹配视频URL
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
            console.log("通过正则表达式找到视频URL:", videoUrl);

            const contextData = {
              photoUrl: videoUrl,
              source: "regex-fallback",
            };

            // 尝试提取更多信息
            this.extractAdditionalInfo(htmlContent, contextData);

            return formatResponse(200, "解析成功", contextData);
          }
        }
      }

      return null;
    } catch (error) {
      console.log("parseWithRegexFallback错误:", error);
      return null;
    }
  }

  parseApolloState(document) {
    try {
      const scripts = document.querySelectorAll("script");
      console.log("查找APOLLO_STATE，script标签数量:", scripts.length);

      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        if (content.includes("__APOLLO_STATE__")) {
          console.log("找到APOLLO_STATE脚本");

          const apolloStateMatch = content.match(
            /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?})(?:\s*;|\s*<\/script>)/
          );
          if (apolloStateMatch) {
            try {
              const apolloStateStr = this.cleanJsonString(apolloStateMatch[1]);
              const apolloState = JSON.parse(apolloStateStr);
              const defaultClient = apolloState.defaultClient || apolloState;

              if (defaultClient) {
                console.log("成功解析APOLLO_STATE，查找视频数据...");
                const result =
                  this.extractVideoDataFromApolloState(defaultClient);
                if (result) {
                  console.log("从APOLLO_STATE找到视频数据");
                  return result;
                }
              }
            } catch (parseError) {
              console.log("解析APOLLO_STATE失败:", parseError.message);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log("parseApolloState错误:", error);
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

        for (const { name, pattern } of dataPatterns) {
          const match = content.match(pattern);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              console.log(`找到${name}数据结构`);
              const result = this.findVideoDataDeep(data);
              if (result) {
                console.log(`从${name}找到视频数据`);
                return result;
              }
            } catch (e) {
              console.log(`解析${name}失败:`, e.message);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log("parseScriptData错误:", error);
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
          let videoUrl = match[1];
          videoUrl = this.cleanUrl(videoUrl);

          if (videoUrl.startsWith("http")) {
            console.log(`通过${name}模式找到视频URL:`, videoUrl);

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
    } catch (error) {
      console.log("parseInlineJsonData错误:", error);
      return null;
    }
  }

  parseMetaTags(document) {
    try {
      const videoData = {};
      const metaTags = document.querySelectorAll("meta");
      console.log("查找meta标签，数量:", metaTags.length);

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
        console.log("从meta标签找到视频数据");
        videoData.source = "meta-tags";
        return formatResponse(200, "解析成功", videoData);
      }

      return null;
    } catch (error) {
      console.log("parseMetaTags错误:", error);
      return null;
    }
  }

  extractVideoDataFromApolloState(apolloState) {
    // 查找包含视频数据的key
    const videoKeys = Object.keys(apolloState).filter(
      (key) =>
        key.includes("Photo") || key.includes("Video") || key.includes("Detail")
    );

    console.log("可能的视频数据keys:", videoKeys.slice(0, 10));

    for (const key of videoKeys) {
      const data = apolloState[key];
      if (data && typeof data === "object") {
        const result = this.extractVideoDataFromObject(data);
        if (result) {
          console.log("从APOLLO_STATE找到视频数据，key:", key);
          return result;
        }
      }
    }

    // 深度搜索
    const deepResult = this.findVideoDataDeep(apolloState);
    if (deepResult) {
      console.log("通过深度搜索找到视频数据");
      return deepResult;
    }

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
      console.log("找到视频数据对象:", JSON.stringify(obj, null, 2));

      const result = {
        photoUrl: videoUrl,
        source: "apollo-state-object",
      };

      // 提取其他字段
      this.mapObjectFields(obj, result);

      console.log("提取的结构化数据:", JSON.stringify(result, null, 2));
      return formatResponse(200, "解析成功", result);
    }

    return null;
  }

  mapObjectFields(source, target) {
    const fieldMappings = {
      // 基本信息
      caption: "caption",
      title: "title",

      // 封面信息
      coverUrl: "coverUrl",
      cover: "coverUrl",
      poster: "coverUrl",
      thumbnail: "coverUrl",
      previewUrl: "coverUrl",

      // 作者信息
      name: "authorName",
      author: "author",
      headUrl: "authorAvatar",
      avatar: "avatar",

      // 统计信息
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
      if (obj.hasOwnProperty(key)) {
        try {
          const result = this.findVideoDataDeep(obj[key], depth + 1);
          if (result) return result;
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  extractAdditionalInfo(htmlContent, videoData) {
    // 简化的封面提取，基于原始代码逻辑
    console.log("开始提取附加信息...");

    // 首先显示页面中所有找到的图片，用于调试
    const allImages = htmlContent.match(
      /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
    );
    if (allImages) {
      console.log(`=== 页面中找到 ${allImages.length} 个图片URL ===`);
      allImages.slice(0, 10).forEach((url, index) => {
        console.log(`图片 ${index + 1}: ${url}`);
      });

      // 特别显示快手相关域名的图片
      const kuaishouImages = allImages.filter(
        (url) =>
          url.toLowerCase().includes("kwimgs") ||
          url.toLowerCase().includes("kwaicdn") ||
          url.toLowerCase().includes("kuaishou")
      );
      if (kuaishouImages.length > 0) {
        console.log(`=== 快手CDN图片 ${kuaishouImages.length} 个 ===`);
        kuaishouImages.forEach((url, index) => {
          console.log(`快手图片 ${index + 1}: ${url}`);
        });
      }
    }

    // 重点：简单而直接的封面提取
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
          console.log("通过模式找到封面图片:", coverUrl);
          videoData.coverUrl = coverUrl;
          break;
        }
      }
    }

    // 如果还没找到封面，搜索所有图片URL
    if (!videoData.coverUrl && allImages) {
      console.log("=== 开始智能封面选择 ===");

      // 策略1: 优先选择快手相关域名的图片
      for (const imageUrl of allImages) {
        const cleanUrl = this.cleanUrl(imageUrl);

        if (this.isKuaishouImageUrl(cleanUrl)) {
          console.log("选择快手图片作为封面:", cleanUrl);
          videoData.coverUrl = cleanUrl;
          break;
        }
      }

      // 策略2: 如果还没找到，使用第一个看起来像封面的图片
      if (!videoData.coverUrl) {
        for (const imageUrl of allImages.slice(0, 15)) {
          // 检查前15个
          const cleanUrl = this.cleanUrl(imageUrl);
          if (this.looksLikeCover(cleanUrl)) {
            console.log("选择可能的封面图片:", cleanUrl);
            videoData.coverUrl = cleanUrl;
            break;
          }
        }
      }

      // 策略3: 最后resort - 使用第一个图片（如果看起来合理）
      if (!videoData.coverUrl && allImages.length > 0) {
        const firstImage = this.cleanUrl(allImages[0]);
        if (this.isReasonableImage(firstImage)) {
          console.log("使用第一个合理的图片作为封面:", firstImage);
          videoData.coverUrl = firstImage;
        }
      }
    }

    // 提取标题
    const captionMatch = htmlContent.match(/"caption":\s*"([^"]+)"/);
    if (captionMatch) {
      videoData.caption = captionMatch[1];
    }

    // 提取作者
    const authorMatch = htmlContent.match(/"name":\s*"([^"]+)"/);
    if (authorMatch && !authorMatch[1].includes("原声")) {
      videoData.authorName = authorMatch[1];
    }

    console.log("附加信息提取完成，封面:", videoData.coverUrl || "未找到");
  }

  isSimpleImageUrl(url) {
    if (!url || !url.startsWith("http")) return false;

    // 简单检查：是否包含图片扩展名
    return url.toLowerCase().match(/\.(jpg|jpeg|png|webp)/);
  }

  isKuaishouImageUrl(url) {
    if (!url || !url.startsWith("http")) return false;

    const urlLower = url.toLowerCase();

    // 检查是否是快手相关域名
    const kuaishouDomains = ["kwimgs.com", "kwaicdn.com", "kuaishou.com"];
    const isKuaishouDomain = kuaishouDomains.some((domain) =>
      urlLower.includes(domain)
    );

    if (!isKuaishouDomain) return false;

    // 排除明显的UI元素
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

    // 排除明显的UI元素和头像
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

    // 检查是否包含图片扩展名
    return urlLower.match(/\.(jpg|jpeg|png|webp)/);
  }

  isReasonableImage(url) {
    if (!url || !url.startsWith("http")) return false;

    const urlLower = url.toLowerCase();

    // 基本的合理性检查
    if (!urlLower.match(/\.(jpg|jpeg|png|webp)/)) return false;

    // 排除明显不合理的图片
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
      // 更安全的JSON清理
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
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
    } catch (error) {
      console.log("JSON清理失败:", error);
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
      console.log("开始广泛搜索...");

      // 更广泛的视频URL模式
      const broadPatterns = [
        // 匹配任何包含视频文件扩展名的URL
        /https?:\/\/[^"'\s]+\.(?:mp4|m3u8|flv|avi|mov|wmv|mkv)(?:[^"'\s]*)?/gi,
        // 匹配可能的视频域名
        /https?:\/\/[^"'\s]*(?:video|media|stream|play|cdn)[^"'\s]*\.(?:mp4|m3u8|flv)/gi,
        // 匹配快手CDN域名
        /https?:\/\/[^"'\s]*(?:kuaishou|kwai|ks)[^"'\s]*\.(mp4|m3u8|flv)/gi,
        // 匹配任何可能的播放URL
        /https?:\/\/[^"'\s]+(?:play|stream|video)[^"'\s]*/gi,
      ];

      for (const pattern of broadPatterns) {
        const matches = htmlContent.match(pattern);
        if (matches) {
          console.log(
            `广泛搜索找到 ${matches.length} 个URL:`,
            matches.slice(0, 5)
          );

          // 验证每个URL
          for (const url of matches.slice(0, 10)) {
            // 限制检查数量
            if (this.isValidVideoUrl(url)) {
              console.log("找到有效视频URL:", url);

              const videoData = {
                photoUrl: url,
                source: "broad-search",
              };

              // 提取附加信息（包括封面）
              this.extractAdditionalInfo(htmlContent, videoData);

              // 不再自动生成封面URL，只使用从页面提取的真实封面
              console.log("最终提取的视频数据:", videoData);
              return formatResponse(200, "解析成功", videoData);
            }
          }
        }
      }

      // 如果还是没找到，尝试从JSON结构中提取
      console.log("尝试从JSON片段中提取...");
      return this.extractFromJsonFragments(htmlContent);
    } catch (error) {
      console.log("parseWithBroadSearch错误:", error);
      return null;
    }
  }

  extractEnhancedInfo(htmlContent, videoData) {
    console.log("开始增强信息提取...");

    // 方法1: 专门搜索txmov2.a.kwimgs.com域名的封面（用户确认的正确域名）
    console.log("=== 搜索真实封面URL（txmov2.a.kwimgs.com域名）===");

    const txmovImages = htmlContent.match(
      /https?:\/\/txmov[^"'\s]*\.kwimgs\.com[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
    );
    if (txmovImages) {
      console.log("*** 找到txmov域名图片 ***:", txmovImages);
      for (const imageUrl of txmovImages) {
        const cleanUrl = this.cleanUrl(imageUrl);
        console.log("检查txmov图片:", cleanUrl);
        videoData.coverUrl = cleanUrl;
        console.log("使用txmov封面URL:", cleanUrl);
        break; // 使用第一个找到的
      }
    }

    // 如果还没找到封面，尝试其他kwimgs域名
    if (!videoData.coverUrl) {
      console.log("=== 搜索其他kwimgs域名的图片 ===");
      const kwimgsImages = htmlContent.match(
        /https?:\/\/[^"'\s]*\.kwimgs\.com[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
      );
      if (kwimgsImages) {
        console.log("找到kwimgs域名图片:", kwimgsImages);
        for (const imageUrl of kwimgsImages) {
          const cleanUrl = this.cleanUrl(imageUrl);
          if (this.isValidCoverUrl(cleanUrl, true)) {
            console.log("使用kwimgs封面URL:", cleanUrl);
            videoData.coverUrl = cleanUrl;
            break;
          }
        }
      }
    }

    // 搜索所有可能的图片URL，特别是快手CDN的图片
    if (!videoData.coverUrl) {
      const imageUrlPatterns = [
        // 快手CDN域名的图片URL
        /https?:\/\/[^"'\s]*(?:kwimgs|kwaicdn|kuaishou)[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi,
        // 标准封面字段
        /"coverUrl":\s*"([^"]+)"/g,
        /"poster":\s*"([^"]+)"/g,
        /"thumbnail":\s*"([^"]+)"/g,
        /"firstFrameUrl":\s*"([^"]+)"/g,
        /"previewUrl":\s*"([^"]+)"/g,
        /"cover":\s*"([^"]+)"/g,
        /"imageUrl":\s*"([^"]+)"/g,
      ];

      let foundCover = false;
      for (let i = 0; i < imageUrlPatterns.length && !foundCover; i++) {
        const pattern = imageUrlPatterns[i];
        const matches = htmlContent.match(pattern);

        if (matches) {
          console.log(
            `封面模式 ${i + 1} 找到 ${matches.length} 个候选:`,
            matches.slice(0, 3)
          );

          for (const match of matches) {
            let coverUrl;
            if (match.startsWith("http")) {
              coverUrl = match;
            } else {
              const urlMatch = match.match(/"([^"]+)"/);
              if (urlMatch) {
                coverUrl = urlMatch[1];
              }
            }

            if (coverUrl) {
              coverUrl = this.cleanUrl(coverUrl);

              // 验证是否为有效的封面URL
              if (this.isValidCoverUrl(coverUrl, i === 0)) {
                // 第一个模式（快手CDN）使用高优先级
                console.log("*** 找到真实封面URL ***:", coverUrl);
                videoData.coverUrl = coverUrl;
                foundCover = true;
                break;
              }
            }
          }
        }
      }
    }

    // 如果还没找到封面，尝试从script标签中专门搜索
    if (!videoData.coverUrl) {
      console.log("=== 在script标签中搜索封面 ===");
      const scriptMatches = htmlContent.matchAll(
        /<script[^>]*>([\s\S]*?)<\/script>/gi
      );

      for (const scriptMatch of scriptMatches) {
        const scriptContent = scriptMatch[1];

        // 专门搜索txmov域名
        const txmovInScript = scriptContent.match(
          /https?:\/\/txmov[^"'\s]*\.kwimgs\.com[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
        );
        if (txmovInScript) {
          console.log("*** 在script中找到txmov图片 ***:", txmovInScript[0]);
          videoData.coverUrl = this.cleanUrl(txmovInScript[0]);
          break;
        }

        // 在script中查找其他图片URL
        const scriptImageMatches = scriptContent.match(
          /https?:\/\/[^"'\s]*(?:kwimgs|kwaicdn)[^"'\s]*\.(?:jpg|jpeg|png|webp)(?:[^"'\s]*)?/gi
        );

        if (scriptImageMatches) {
          console.log(
            "在script中找到图片URLs:",
            scriptImageMatches.slice(0, 3)
          );

          for (const imageUrl of scriptImageMatches) {
            const cleanImageUrl = this.cleanUrl(imageUrl);
            if (this.isValidCoverUrl(cleanImageUrl, true)) {
              console.log("*** 从script中找到封面URL ***:", cleanImageUrl);
              videoData.coverUrl = cleanImageUrl;
              break;
            }
          }

          if (videoData.coverUrl) break;
        }
      }
    }

    // 方法2: 提取标题和描述
    const titlePatterns = [
      /"caption":\s*"([^"]+)"/,
      /"title":\s*"([^"]+)"/,
      /"description":\s*"([^"]+)"/,
      /"content":\s*"([^"]+)"/,
      /<title[^>]*>([^<]+)<\/title>/i,
      /"og:title"\s*content="([^"]+)"/,
    ];

    for (const pattern of titlePatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1] && !videoData.caption && !videoData.title) {
        const title = match[1].trim();
        if (title && title.length > 0 && !title.includes("快手")) {
          console.log("找到标题:", title);
          videoData.caption = title;
          break;
        }
      }
    }

    // 方法3: 提取作者信息
    const authorPatterns = [
      /"name":\s*"([^"]+)"/,
      /"author":\s*"([^"]+)"/,
      /"userName":\s*"([^"]+)"/,
      /"nickname":\s*"([^"]+)"/,
    ];

    for (const pattern of authorPatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1] && !videoData.authorName) {
        const author = match[1].trim();
        if (
          author &&
          !author.includes("原声") &&
          !author.includes("背景音乐")
        ) {
          console.log("找到作者:", author);
          videoData.authorName = author;
          break;
        }
      }
    }

    // 方法4: 提取统计信息
    const statsPatterns = [
      {
        key: "likeCount",
        patterns: [/"likeCount":\s*(\d+)/, /"like":\s*(\d+)/],
      },
      {
        key: "commentCount",
        patterns: [/"commentCount":\s*(\d+)/, /"comment":\s*(\d+)/],
      },
      {
        key: "shareCount",
        patterns: [/"shareCount":\s*(\d+)/, /"share":\s*(\d+)/],
      },
      {
        key: "playCount",
        patterns: [/"playCount":\s*(\d+)/, /"view":\s*(\d+)/],
      },
    ];

    for (const { key, patterns } of statsPatterns) {
      for (const pattern of patterns) {
        const match = htmlContent.match(pattern);
        if (match && match[1] && !videoData[key]) {
          videoData[key] = parseInt(match[1]);
          console.log(`找到${key}:`, videoData[key]);
          break;
        }
      }
    }

    console.log("增强信息提取完成，找到封面:", !!videoData.coverUrl);
  }

  isValidCoverUrl(url, isHighPriority = false) {
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return false;
    }

    // 严格排除UI元素、图标等
    const excludeKeywords = [
      "icon",
      "logo",
      "button",
      "ui",
      "assets",
      "sprite",
      "background",
      "bg-",
      "overlay",
      "mask",
      "border",
      "line-up",
      "menu",
      "tip",
      "arrow",
      "close",
      "play-btn",
      "share-btn",
      "like-btn",
      "comment-btn",
      "download-btn",
      "notinline",
      "inline",
      "css",
      "style",
      "theme",
    ];

    const urlLower = url.toLowerCase();
    if (excludeKeywords.some((keyword) => urlLower.includes(keyword))) {
      console.log("排除UI元素URL:", url);
      return false;
    }

    // 排除明显的头像URL（但允许一些可能的封面）
    if (urlLower.includes("avatar") || urlLower.includes("user-head")) {
      console.log("排除头像URL:", url);
      return false;
    }

    // 检查是否包含图片格式
    const imageFormats = [".jpg", ".jpeg", ".png", ".webp"];
    const hasImageFormat = imageFormats.some((format) =>
      urlLower.includes(format)
    );

    if (!hasImageFormat) {
      console.log("非图片格式URL:", url);
      return false;
    }

    // 快手CDN域名的图片都认为是有效的（高优先级）
    if (
      urlLower.includes("kwimgs") ||
      urlLower.includes("kwaicdn") ||
      urlLower.includes("kuaishou")
    ) {
      console.log("快手CDN图片URL通过:", url);
      return true;
    }

    // 高优先级模式：标准封面字段
    if (isHighPriority) {
      console.log("高优先级模式通过:", url);
      return true;
    }

    // 低优先级模式：需要包含封面相关关键词
    const coverKeywords = [
      "cover",
      "thumb",
      "poster",
      "preview",
      "snapshot",
      "frame",
    ];
    const hasCoverKeyword = coverKeywords.some((keyword) =>
      urlLower.includes(keyword)
    );

    const isValid = hasCoverKeyword;
    console.log(`封面URL验证 ${isValid ? "通过" : "失败"}:`, url);
    return isValid;
  }

  extractFromJsonFragments(htmlContent) {
    try {
      // 查找所有可能的JSON片段
      const jsonPatterns = [
        /\{[^{}]*"(?:photoUrl|playUrl|videoUrl|mp4Url)"[^{}]*\}/g,
        /\{[^{}]*"url":\s*"https?:\/\/[^"]*\.(?:mp4|m3u8|flv)[^"]*"[^{}]*\}/g,
        /\{[^{}]*"src":\s*"https?:\/\/[^"]*\.(?:mp4|m3u8|flv)[^"]*"[^{}]*\}/g,
      ];

      for (const pattern of jsonPatterns) {
        const matches = htmlContent.match(pattern);
        if (matches) {
          console.log(`找到JSON片段 ${matches.length} 个`);

          for (const jsonStr of matches.slice(0, 5)) {
            try {
              const data = JSON.parse(jsonStr);
              console.log("解析JSON片段成功:", data);

              const videoUrl =
                data.photoUrl ||
                data.playUrl ||
                data.videoUrl ||
                data.mp4Url ||
                data.url ||
                data.src;
              if (videoUrl && this.isValidVideoUrl(videoUrl)) {
                console.log("从JSON片段找到视频URL:", videoUrl);

                return formatResponse(200, "解析成功", {
                  photoUrl: videoUrl,
                  source: "json-fragment",
                  ...data,
                });
              }
            } catch {
              // 忽略无效的JSON
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log("extractFromJsonFragments错误:", error);
      return null;
    }
  }

  isValidVideoUrl(url) {
    if (!url || typeof url !== "string") return false;

    // 检查是否是有效的HTTP/HTTPS URL
    if (!url.startsWith("http")) return false;

    // 检查是否包含视频文件扩展名或视频相关关键词
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

void KuaishouParser;

async function runKuaishou(url) {
  return await parseKuaishou(url);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json(formatResponse(201, "链接不能为空！"), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  console.log("=== 开始处理快手URL ===");
  console.log("原始URL:", url);

  try {
    const jsonData = await runKuaishou(url);
    console.log("解析结果:", jsonData);

    if (jsonData) {
      console.log("=== 解析成功 ===");
      return Response.json(jsonData, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } else {
      console.log("=== 解析失败 ===");
      return Response.json(
        formatResponse(404, "解析失败，可能是链接格式不支持或内容无法访问"),
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }
  } catch (error) {
    console.log("=== API处理错误 ===");
    console.log("错误详情:", error);
    return Response.json(formatResponse(500, "服务器错误", error.message), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
