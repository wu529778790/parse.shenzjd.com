/**
 * 统一视频解析入口
 * 支持两种调用方式:
 * 1. ?url=分享链接
 * 2. ?source=平台&id=视频ID
 *
 * 参考: https://github.com/wujunwei928/parse-video
 */

import { createApiHandler, safeStatus } from "@/lib/api-middleware";
import { logger } from "@/lib/api-utils";
import {
  identifyPlatform,
  getPlatformName,
  PLATFORM_INFO,
} from "@/lib/platforms";

// 导入各平台解析器
import { parseKuaishou } from "@/lib/kuaishouCore";

// 平台解析器映射
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

  // 动态导入对应平台的路由解析器（与实际目录名匹配）
  const platformRoutes = {
    douyin: () => import("@/app/api/douyin/route.js"),
    bilibili: () => import("@/app/api/bilibili/route.js"),
    xhs: () => import("@/app/api/xhs/route.js"),
    huya: () => import("@/app/api/huya/route.js"),
    haokan: () => import("@/app/api/haokan/route.js"),
    weibo: () => import("@/app/api/weibo/route.js"),
    weishi: () => import("@/app/api/weishi/route.js"),
    xigua: () => import("@/app/api/xigua/route.js"),
    huoshan: () => import("@/app/api/huoshan/route.js"),
    acfun: () => import("@/app/api/acfun/route.js"),
    lishipin: () => import("@/app/api/lishipin/route.js"),
    // 皮皮虾目录是 ppxia
    pipixia: () => import("@/app/api/ppxia/route.js"),
    pipigx: () => import("@/app/api/pipigx/route.js"),
    sixroom: () => import("@/app/api/sixroom/route.js"),
    lvzhou: () => import("@/app/api/lvzhou/route.js"),
    meipai: () => import("@/app/api/meipai/route.js"),
    zuiyou: () => import("@/app/api/zuiyou/route.js"),
    quanmin: () => import("@/app/api/quanmin/route.js"),
    quanminkge: () => import("@/app/api/quanminkge/route.js"),
    doupai: () => import("@/app/api/doupai/route.js"),
    xinpianchang: () => import("@/app/api/xinpianchang/route.js"),
    twitter: () => import("@/app/api/twitter/route.js"),
  };

  const loader = platformRoutes[platform];
  if (loader) {
    try {
      const mod = await loader();
      // 假设路由模块导出解析函数
      return mod.default || mod.GET;
    } catch {
      return null;
    }
  }

  return null;
}

// 统一解析入口
async function unifiedParser(input, options = {}) {
  try {
    // 方式1: 直接传入 URL
    if (typeof input === "string" && (input.includes("://") || input.includes("."))) {
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
      const result = await parser(input);
      if (result?.data?.platform === undefined) {
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
      msg: `服务器错误：${error.message}`,
    };
  }
}

// GET 请求处理
export async function GET(request) {
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
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  if (url) {
    return createApiHandler((url) => unifiedParser(url))(request);
  }

  if (source && id) {
    return createApiHandler((u) => unifiedParser(u, { source, id }))(request);
  }
}

export const runtime = "edge";
