/**
 * 统一解析器核心
 * 参考: https://github.com/wujunwei928/parse-video
 */

export interface BaseParserOptions {
  platform?: string;
  userAgent?: string;
  timeout?: number;
}

export interface ParseResult {
  code: number;
  msg: string;
  data?: Record<string, unknown>;
  platform?: string;
  [key: string]: unknown;
}

interface UrlPattern {
  platform: string;
  domain: string;
  parser: BaseParser;
}

/**
 * 基础解析器类
 * 所有平台解析器应继承此类
 */
export class BaseParser {
  platform: string;
  defaultHeaders: Record<string, string>;
  timeout: number;

  constructor(options: BaseParserOptions = {}) {
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

  async parseShareUrl(_url: string): Promise<ParseResult | null> {
    throw new Error("parseShareUrl must be implemented");
  }

  async parseVideoId(_videoId: string): Promise<ParseResult | null> {
    throw new Error("parseVideoId must be implemented");
  }

  /**
   * 发送 HTTP 请求
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const defaultOptions: RequestInit = {
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
  extractJsonFromScript(html: string, pattern: string): unknown | null {
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
  cleanJsonString(jsonStr: string): string {
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
  cleanUrl(url: string): string {
    return url
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");
  }

  /**
   * 格式化响应
   */
  formatResponse(code: number = 200, msg: string = "解析成功", data: Record<string, unknown> = {}): ParseResult {
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
  parsers: Map<string, BaseParser>;
  urlPatterns: UrlPattern[];

  constructor() {
    this.parsers = new Map();
    this.urlPatterns = [];
  }

  /**
   * 注册解析器
   */
  register(platform: string, parser: BaseParser, domains: string[] = []): void {
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
  getParserByUrl(url: string): BaseParser | null {
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
  getParserByPlatform(platform: string): BaseParser | null {
    return this.parsers.get(platform) || null;
  }

  /**
   * 获取所有已注册的解析器
   */
  getAllParsers(): Record<string, BaseParser> {
    return Object.fromEntries(this.parsers);
  }
}

// 全局解析器注册表
export const parserRegistry = new ParserRegistry();

/**
 * 统一解析函数
 * @param urlOrPlatform - URL 或平台名称
 * @param videoId - 视频 ID（可选）
 */
export async function parseVideo(urlOrPlatform: string, videoId: string | null = null): Promise<ParseResult> {
  // 如果是 URL 格式
  if (urlOrPlatform.includes("://") || urlOrPlatform.includes(".")) {
    const { identifyPlatform } = await import("./platforms");
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

    const result = await parser.parseShareUrl(urlOrPlatform);
    return result ?? { code: 500, msg: "解析失败" };
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

    const result = await parser.parseVideoId(videoId);
    return result ?? { code: 500, msg: "解析失败" };
  }

  return {
    code: 400,
    msg: "参数错误，请提供 URL 或 平台+视频ID",
  };
}
