/**
 * 统一视频解析入口
 * 支持两种调用方式:
 * 1. ?url=分享链接
 * 2. ?source=平台&id=视频ID
 *
 * 参考: https://github.com/wujunwei928/parse-video
 */

import { createApiHandler, safeStatus } from "@/lib/api-middleware";
import { logger, rateLimit, getClientIP, getCorsHeaders } from "@/lib/api-utils";
import { normalizeResult } from "@/lib/normalize-result";
import {
  identifyPlatform,
  getPlatformName,
  PLATFORM_INFO,
} from "@/lib/platforms";
import { isBlockedText } from "@/lib/blockedPlatforms";
import { public17Parse } from "@/lib/douyinFallback";
import { getPlatformParser } from "@/lib/platformRoutes";
import { verifyDirectUrl } from "@/lib/verifyUrl";

// 导入各平台解析器
import { parseKuaishou } from "@/lib/kuaishouCore";

// 平台解析器映射（优先于 route 模块的注册函数）
const platformParsers = {
  kuaishou: parseKuaishou,
  // 可以继续添加其他平台
};

// 获取平台对应的解析函数
async function getParser(platform) {
  // 如果有直接注册的解析器
  if (platformParsers[platform]) {
    return platformParsers[platform];
  }

  // 动态导入对应平台的路由解析器（映射统一维护在 lib/platformRoutes.js）
  return await getPlatformParser(platform);
}

// 统一解析入口
async function unifiedParser(input, options = {}) {
  try {
    // 方式1: 直接传入 URL
    if (typeof input === "string" && (input.includes("://") || input.includes("."))) {
      // 付费/DRM 平台黑名单（腾讯视频/爱奇艺/优酷/Netflix 等）：
      // 在平台识别之前拦截，给用户明确提示而不是白费流量解析失败
      const blockedName = isBlockedText(input);
      if (blockedName) {
        logger.log(`黑名单拦截: ${blockedName}（${input.slice(0, 60)}）`);
        return {
          code: 400,
          msg: `暂不支持解析${blockedName}的内容（会员/付费/DRM 保护）`,
        };
      }

      const platform = identifyPlatform(input);

      if (!platform) {
        return {
          code: 400,
          msg: "无法识别的视频平台，请确保链接格式正确",
        };
      }

      logger.log(`识别到平台: ${platform} (${getPlatformName(platform)})`);

      const parser = await getParser(platform);
      if (!parser) {
        return {
          code: 404,
          msg: `暂不支持 ${getPlatformName(platform)} 平台的统一解析，请使用单独的接口`,
        };
      }

      // 调用对应的解析函数
      let result = await parser(input);
      // 快手备用通道：主解析失败（页面结构变化/反爬）时，用 17change 公共 API 兜底
      // （参考 video-unwatermark webparser 引擎，实测对快手可用）
      if (
        platform === "kuaishou" &&
        (!result || result.code !== 200) &&
        typeof input === "string" &&
        input.includes("://")
      ) {
        try {
          const fb = await public17Parse(input);
          if (fb.ok && fb.url) {
            logger.log(`快手主解析失败，公共 API 兜底命中（${fb.key}）`);
            result = {
              code: 200,
              msg: "解析成功",
              data: {
                photoUrl: fb.url,
                caption: fb.title || "视频",
                coverUrl: fb.cover || "",
                authorName: fb.author || "",
                source: fb.key,
              },
            };
          }
        } catch (error) {
          logger.warn(`快手公共 API 兜底异常: ${error.message}`);
        }
      }
      // 直链有效性验证（保守策略：仅明确 404/410 判坏链，403/超时等不确定一律不阻断）
      if (result?.code === 200 && result?.data) {
        const urlKey = typeof result.data.url === "string" ? "url" : typeof result.data.photoUrl === "string" ? "photoUrl" : null;
        const direct = urlKey ? result.data[urlKey] : "";
        if (direct && direct.startsWith("http")) {
          try {
            const v = await verifyDirectUrl(direct);
            if (v.ok === false) {
              logger.warn(
                `[verify] 平台 ${platform} 直链失效 (HTTP ${v.status})，已置空 URL`
              );
              result.data[urlKey] = undefined;
              result.msg = result.msg || "解析成功";
            }
          } catch (e) {
            logger.warn(`[verify] 平台 ${platform} 直链验证异常: ${e.message}`);
          }
        }
      }

      if (result && result.platform === undefined) {
        result.platform = platform;
      }
      return result;
    }

    // 方式2: 平台 + ID
    if (typeof input === "string" && options.source && options.id) {
      const platform = options.source.toLowerCase();
      const info = PLATFORM_INFO[platform];

      if (!info) {
        return {
          code: 400,
          msg: `未知平台: ${platform}`,
        };
      }

      if (!info.supportsIdParse) {
        return {
          code: 400,
          msg: `${info.name} 平台不支持通过 ID 解析，请使用分享链接`,
        };
      }

      const parser = await getParser(platform);
      if (!parser) {
        return {
          code: 404,
          msg: `暂不支持 ${info.name} 平台`,
        };
      }

      // 有些解析器支持直接传 ID
      if (parser.parseVideoId) {
        return await parser.parseVideoId(options.id);
      }

      return {
        code: 400,
        msg: `${info.name} 解析器暂不支持 ID 解析模式`,
      };
    }

    return {
      code: 400,
      msg: "参数错误：需要提供 URL 或 平台+ID",
    };
  } catch (error) {
    logger.error("统一解析器错误:", error);
    return {
      code: 500,
      msg: "服务器内部错误",
    };
  }
}

// GET 请求处理
export async function GET(request) {
  const corsHeaders = getCorsHeaders(request.headers.get('origin') || '');
  const { searchParams } = new URL(request.url);

  // 方式1: ?url=xxx
  const url = searchParams.get("url");

  // 方式2: ?source=xxx&id=xxx
  const source = searchParams.get("source");
  const id = searchParams.get("id");

  if (!url && !source) {
    return Response.json(
      {
        code: 400,
        msg: "参数缺失：请提供 url 参数 或 source+id 参数",
        usage: {
          "方式1(推荐)": "/api/parse?url=分享链接",
          "方式2": "/api/parse?source=douyin&id=视频ID",
        },
        supportedPlatforms: Object.entries(PLATFORM_INFO)
          .filter(([, info]) => info.supportsIdParse)
          .map(([key, info]) => ({
            platform: key,
            name: info.name,
            supportsIdParse: true,
          })),
      },
      {
        status: safeStatus(400),
        headers: corsHeaders,
      }
    );
  }

  if (url) {
    // 禁用缓存：统一入口需要为结果补充 platform 字段（各平台路由的缓存
    // 与统一入口共享同一缓存 Map，命中缓存会绕过 unifiedParser 的
    // platform 补充逻辑）。防刷由 createApiHandler 的限流兜底。
    return createApiHandler((url) => unifiedParser(url), { shouldCache: false })(request);
  }

  if (source && id) {
    // source+id 路径也受速率限制保护
    const clientIP = getClientIP(request);
    if (!rateLimit(clientIP)) {
      return Response.json(
        { code: 429, msg: "请求过于频繁，请稍后再试" },
        { status: safeStatus(429), headers: corsHeaders }
      );
    }

    const result = normalizeResult(await unifiedParser("", { source, id }));
    return Response.json(result, {
      status: safeStatus(result?.code || 200),
      headers: corsHeaders,
    });
  }
}

export const runtime = "nodejs";
