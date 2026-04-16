/**
 * 统一解析器核心
 * 参考: https://github.com/wujunwei928/parse-video
 */

/**
 * 基础解析器类
 * 所有平台解析器应继承此类
 */
export class BaseParser {
  constructor(options = {}) {
    this.platform = options.platform || "";
    this.defaultHeaders = {
      "User-Agent":
        options.userAgent ||
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    };
    this.timeout = options.timeout || 15000;
  }

  async parseShareUrl() {
    throw new Error("parseShareUrl must be implemented");
  }

  async parseVideoId() {
    throw new Error("parseVideoId must be implemented");
  }

  /**
   * 发送 HTTP 请求
   */
  async fetch(url, options = {}) {
    const defaultOptions = {
      headers: this.defaultHeaders,
      signal: AbortSignal.timeout(this.timeout),
      redirect: "follow",
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    return response;
  }

  /**
   * 从 HTML 中提取 JSON 数据
   */
  extractJsonFromScript(html, pattern) {
    const regex = new RegExp(pattern, "s");
    const match = html.match(regex);
    if (match && match[1]) {
      try {
        const jsonStr = this.cleanJsonString(match[1]);
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * 清理 JSON 字符串
   */
  cleanJsonString(jsonStr) {
    return jsonStr
      .replace(/function\s*\([^)]*\)\s*{[^{}]*(?:{[^{}]*}[^{}]*)*}/g, "null")
      .replace(/:\s*undefined/g, ":null")
      .replace(/,\s*undefined/g, ",null")
      .replace(/,\s*(?=})/g, "")
      .replace(/,\s*(?=])/g, "")
      .replace(/new\s+Date\([^)]*\)/g, "null")
      .replace(/Symbol\([^)]*\)/g, "null");
  }

  /**
   * 清理 URL
   */
  cleanUrl(url) {
    return url
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");
  }

  /**
   * 格式化响应
   */
  formatResponse(code = 200, msg = "解析成功", data = {}) {
    return {
      code,
      msg,
      data,
      platform: this.platform,
    };
  }
}

/**
 * 解析器注册表
 * 管理所有平台解析器
 */
class ParserRegistry {
  constructor() {
    this.parsers = new Map();
    this.urlPatterns = [];
  }

  /**
   * 注册解析器
   */
  register(platform, parser, domains = []) {
    this.parsers.set(platform, parser);
    domains.forEach((domain) => {
      this.urlPatterns.push({
        platform,
        domain,
        parser,
      });
    });
  }

  /**
   * 根据 URL 获取解析器
   */
  getParserByUrl(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      for (const pattern of this.urlPatterns) {
        if (
          hostname === pattern.domain ||
          hostname.endsWith(`.${pattern.domain}`)
        ) {
          return pattern.parser;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * 根据平台名称获取解析器
   */
  getParserByPlatform(platform) {
    return this.parsers.get(platform) || null;
  }

  /**
   * 获取所有已注册的解析器
   */
  getAllParsers() {
    return Object.fromEntries(this.parsers);
  }
}

// 全局解析器注册表
export const parserRegistry = new ParserRegistry();

/**
 * 统一解析函数
 * @param {string} urlOrPlatform - URL 或平台名称
 * @param {string} videoId - 视频 ID（可选）
 * @returns {Promise<object>}
 */
export async function parseVideo(urlOrPlatform, videoId = null) {
  // 如果是 URL 格式
  if (urlOrPlatform.includes("://") || urlOrPlatform.includes(".")) {
    const { identifyPlatform } = await import("./platforms.js");
    const platform = identifyPlatform(urlOrPlatform);

    if (!platform) {
      return {
        code: 400,
        msg: "无法识别的平台",
      };
    }

    const parser = parserRegistry.getParserByPlatform(platform);
    if (!parser) {
      return {
        code: 404,
        msg: `平台 ${platform} 解析器未注册`,
      };
    }

    return await parser.parseShareUrl(urlOrPlatform);
  }

  // 如果是平台 + ID 格式
  if (videoId) {
    const parser = parserRegistry.getParserByPlatform(urlOrPlatform);
    if (!parser) {
      return {
        code: 404,
        msg: `平台 ${urlOrPlatform} 解析器未注册`,
      };
    }

    return await parser.parseVideoId(videoId);
  }

  return {
    code: 400,
    msg: "参数错误，请提供 URL 或 平台+视频ID",
  };
}
