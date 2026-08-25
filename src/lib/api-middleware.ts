// 通用 API 中间件函数
import {
  getCachedResponse,
  setCacheResponse,
  rateLimit,
  isValidUrl,
  sanitizeUrl,
  getClientIP,
  getCorsHeaders,
  logger,
  errorResponse,
  serverErrorResponse,
  parseErrorResponse
} from "@/lib/api-utils";
import { normalizeResult } from "@/lib/normalize-result";
import { recordParse } from "@/lib/analytics";
import { getWxAuthToken, checkWxAuthToken } from "@/lib/wx-auth-guard";

/**
 * 安全的状态码 - 确保在 200-599 范围内
 */
export function safeStatus(code: number): number {
  const num = Number(code);
  if (Number.isNaN(num)) return 500;
  if (num < 200) return 500;
  if (num > 599) return 500;
  return Math.round(num);
}

export interface ApiHandlerOptions {
  shouldCache?: boolean;
  responseHeaders?: Record<string, string>;
}

type ParseFunction = (url: string) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

// 平台专用路由（/api/douyin 等）的域名白名单（route 名 → 域名后缀 + 中文名）。
// 与 lib/platforms.ts 的 PLATFORM_INFO.domains/shortDomains 对齐（route 名与平台 key 命名
// 不完全一致，如 /api/xhs→小红书、/api/ppxia→皮皮虾，故在此集中维护一份按 route 名的映射）。
// 匹配规则：hostname === d || hostname.endsWith("." + d)，短链域名（v.douyin.com 等）
// 由主域名 douyin.com 的 endsWith 覆盖，无需重复列出。
const ROUTE_DOMAIN_MAP: Record<string, { name: string; hosts: string[] }> = {
  douyin: { name: "抖音", hosts: ["douyin.com", "iesdouyin.com", "snssdk.com", "wtturl.cn"] },
  bilibili: { name: "哔哩哔哩", hosts: ["bilibili.com", "b23.tv"] },
  xhs: { name: "小红书", hosts: ["xiaohongshu.com", "xhslink.com", "xhslink.cn"] },
  kuaishou: { name: "快手", hosts: ["kuaishou.com", "kuaishoup.com"] },
  weibo: { name: "微博", hosts: ["weibo.com"] },
  lvzhou: { name: "绿洲", hosts: ["weibo.cn"] },
  ppxia: { name: "皮皮虾", hosts: ["pipix.com"] },
  pipigx: { name: "皮皮搞笑", hosts: ["pipigx.com"] },
  huoshan: { name: "火山", hosts: ["huoshan.com"] },
  weishi: { name: "微视", hosts: ["weishi.qq.com"] },
  xigua: { name: "西瓜视频", hosts: ["ixigua.com"] },
  zuiyou: { name: "最右", hosts: ["izuiyou.com", "xiaochuankeji.com", "xiaochuankeji.cn"] },
  quanmin: { name: "度小视", hosts: ["quanmin.baidu.com", "xspshare.baidu.com"] },
  lishipin: { name: "梨视频", hosts: ["pearvideo.com"] },
  huya: { name: "虎牙", hosts: ["huya.com"] },
  acfun: { name: "AcFun", hosts: ["acfun.cn"] },
  meipai: { name: "美拍", hosts: ["meipai.com"] },
  doupai: { name: "逗拍", hosts: ["doupai.cc"] },
  quanminkge: { name: "全民K歌", hosts: ["kg.qq.com", "quanmin.kg.qq.com"] },
  sixroom: { name: "六间房", hosts: ["6.cn"] },
  xinpianchang: { name: "新片场", hosts: ["xinpianchang.com"] },
  haokan: { name: "好看视频", hosts: ["haokan.baidu.com", "haokan.hao123.com"] },
  twitter: { name: "X (Twitter)", hosts: ["twitter.com", "x.com", "t.co"] },
  youtube: { name: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  tiktok: { name: "TikTok", hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"] },
};

// 需强制微信认证的解析类路由 = 24 个平台专用接口 + 统一入口 /api/parse。
// health/stats/image/engines 等非解析接口是原生路由（不经本中间件），天然不受影响。
const AUTH_REQUIRED_ROUTES = new Set<string>([
  ...Object.keys(ROUTE_DOMAIN_MAP),
  "parse",
]);

// 通用 API 处理函数
export const createApiHandler = (
  parseFunction: ParseFunction,
  options: ApiHandlerOptions = {}
): ((request: Request) => Promise<Response>) => {
  const {
    shouldCache = true,
    responseHeaders = {},
  } = options;

  const extraHeaders = {
    ...responseHeaders,
  };

  return async (request: Request): Promise<Response> => {
    const startTime = Date.now();
    const corsHeaders = getCorsHeaders(request.headers.get('origin') || '') as Record<string, string>;
    const headers = { ...corsHeaders, ...extraHeaders };

    // 统一入口（/api/parse）内部转发到平台路由时带 x-parse-internal 标记：
    // 此时不重复记录行为分析（避免一次解析写两条 parse/parser 记录），
    // 统计只由最外层请求记录一次。
    const isInternalRequest = request.headers.get("x-parse-internal") === "1";

    // 获取客户端IP
    const clientIP = getClientIP(request);
    logger.log(`API request from IP: ${clientIP}`);

    // 平台使用统计：生产环境 logger.log 不输出，这里用 console.log 确保线上可观测。
    // 从 URL 路径推断平台（如 /api/bilibili -> bilibili），用于排查各平台是否有人使用。
    // routeMatch 提升到函数级，供成功分支的行为分析记录复用。
    let routeMatch: RegExpMatchArray | null = null;
    try {
      const pathname = new URL(request.url).pathname;
      routeMatch = pathname.match(/\/api\/([a-z0-9]+)/i);
      if (routeMatch) {
        console.log(
          `[usage] route=${routeMatch[1]} time=${new Date().toISOString()}`
        );
      }
    } catch {
      // 日志失败不影响主流程
    }

    // 每次解析打印一条流水日志（console.log 保证生产环境也输出，对齐 [usage] 风格；
    // logger.log 仅开发环境输出，成功解析在生产上会没日志）
    const logParse = (
      status: string,
      code: number | string,
      durationMs: number,
      reason?: string
    ) => {
      const route = String(routeMatch?.[1] || "");
      const safeUrl = sanitizedUrl || "";
      const shortUrl =
        safeUrl.length > 60 ? safeUrl.slice(0, 60) + "..." : safeUrl;
      console.log(
        `[parse] route=${route} url=${shortUrl} status=${status} code=${code} time=${durationMs}ms${
          reason ? ` reason=${reason.slice(0, 80)}` : ""
        }`
      );
    };

    // 检查速率限制
    if (!rateLimit(clientIP)) {
      return Response.json(
        errorResponse("请求过于频繁，请稍后再试", 429),
        {
          status: safeStatus(429),
          headers
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return Response.json(
        errorResponse("url为空", 400),
        {
          status: safeStatus(400),
          headers
        }
      );
    }

    // 验证URL格式
    if (!isValidUrl(url)) {
      return Response.json(
        errorResponse("无效的URL格式", 400),
        {
          status: safeStatus(400),
          headers
        }
      );
    }

    // 安全检查：防止SSRF攻击
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) {
      logger.warn(`SSRF attempt blocked from IP: ${clientIP}, URL: ${url.substring(0, 100)}`);
      return Response.json(
        errorResponse("URL包含不允许访问的地址", 400),
        {
          status: safeStatus(400),
          headers
        }
      );
    }

    // 平台域名白名单校验：/api/douyin 等专用接口只接受本平台域名链接。
    // 否则任意 URL（如 threads.com）都会被当成抖音尝试解析——先 fetch 外部站、
    // 再报「无法提取视频 ID」，白费流量且报错误导。统一入口（/api/parse）与
    // 内部转发（/api/parser）不在映射表内，跳过（/api/parse 已有 identifyPlatform 校验）。
    const routeName = String(routeMatch?.[1] || "");
    const routeDomain = ROUTE_DOMAIN_MAP[routeName];
    if (routeDomain) {
      try {
        const hostname = new URL(sanitizedUrl).hostname.toLowerCase();
        const isAllowed = routeDomain.hosts.some(
          (d) => hostname === d || hostname.endsWith(`.${d}`)
        );
        if (!isAllowed) {
          logParse(
            "failed",
            400,
            Date.now() - startTime,
            `域名(${hostname})不属于${routeDomain.name}平台`
          );
          logger.warn(
            `平台域名不匹配: route=${routeName} host=${hostname} url=${sanitizedUrl.substring(0, 100)}`
          );
          return Response.json(
            errorResponse(`该链接（${hostname}）不属于${routeDomain.name}平台，已拒绝解析，请粘贴正确的${routeDomain.name}分享链接`, 400),
            {
              status: safeStatus(400),
              headers
            }
          );
        }
      } catch {
        // URL 已通过 isValidUrl/sanitizeUrl，这里解析失败属异常，按拒绝处理
        return Response.json(
          errorResponse("无效的URL格式", 400),
          {
            status: safeStatus(400),
            headers
          }
        );
      }
    }

    // 解析类接口强制微信认证（登录才能解析）：
    // 读取 SDK 写入的 wxauth-token Cookie → 远程校验（5 分钟缓存）→ 未认证 401。
    // 豁免：内部转发（/api/parse 最外层已认证，内层是服务端构造的请求无浏览器 Cookie）、
    // 非解析类接口（health/stats/image/engines 等原生路由不经本中间件）、VITEST 测试环境。
    if (!isInternalRequest && process.env.VITEST !== "true" && AUTH_REQUIRED_ROUTES.has(routeName)) {
      const wxToken = getWxAuthToken(request);
      const authenticated = wxToken ? await checkWxAuthToken(wxToken) : false;
      if (!authenticated) {
        logParse("failed", 401, Date.now() - startTime, "未完成微信认证");
        logger.warn(
          `未认证解析被拒绝: route=${routeName} ip=${clientIP} url=${sanitizedUrl.substring(0, 100)}`
        );
        return Response.json(
          errorResponse("请先关注公众号「神族九帝」并完成认证后使用解析功能", 401),
          {
            status: safeStatus(401),
            headers
          }
        );
      }
    }

    if (shouldCache) {
      const cached = getCachedResponse(sanitizedUrl);
      if (cached) {
        const duration = Date.now() - startTime;
        logParse("cached", 200, duration);
        return Response.json(cached, {
          headers,
        });
      }
    }

    try {
      logger.log(`Parsing URL: ${sanitizedUrl.substring(0, 80)}...`);
      const rawResult = await parseFunction(sanitizedUrl);

      if (!rawResult) {
        const duration = Date.now() - startTime;
        logParse("failed", 400, duration, "解析失败（无返回结果）");
        logger.warn(`Parse failed after ${duration}ms for URL: ${sanitizedUrl.substring(0, 80)}`);
        // 失败也记录：便于发现未支持/失效的平台与链接。
        // 注意：必须 await —— CF Workers 响应返回后 isolate 冻结，
        // fire-and-forget 的 Turso 写入请求会被丢弃（线上曾因此零入库）。
        if (!isInternalRequest) {
          await recordParse({
            platform: String(routeMatch?.[1] || ""),
            url: sanitizedUrl,
            ip: clientIP,
            status: "failed",
            reason: "解析失败（无返回结果）",
          }).catch(() => {});
        }
        return Response.json(
          parseErrorResponse("解析失败"),
          {
            status: safeStatus(400),
            headers
          }
        );
      }

      // 统一响应模型：成功结果在出口统一归一化（code=200 + data 统一字段契约）
      const result = normalizeResult(rawResult);

      // 解析结果（成功/失败）异步记录行为分析。
      // 必须 await（同 CF Workers isolate 冻结问题），写入失败静默不影响主流程
      if (result?.code === 200) {
        if (!isInternalRequest) {
          await recordParse({
            platform: String(result.platform || routeMatch?.[1] || ""),
            url: sanitizedUrl,
            ip: clientIP,
            status: "success",
          }).catch(() => {});
        }
        logParse("success", 200, Date.now() - startTime);
      } else {
        if (!isInternalRequest) {
          await recordParse({
            platform: String(result?.platform || routeMatch?.[1] || ""),
            url: sanitizedUrl,
            ip: clientIP,
            status: "failed",
            reason: String(result?.msg || "解析失败"),
          }).catch(() => {});
        }
        logParse(
          "failed",
          Number(result?.code || 0),
          Date.now() - startTime,
          String(result?.msg || "")
        );
      }

      if (shouldCache) {
        setCacheResponse(sanitizedUrl, result);
      }

      return Response.json(result, {
        headers,
      });
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logParse("error", 500, duration, errMsg);
      logger.error(`API error after ${duration}ms:`, errMsg);
      if (!isInternalRequest) {
        await recordParse({
          platform: String(routeMatch?.[1] || ""),
          url: sanitizedUrl,
          ip: clientIP,
          status: "failed",
          reason: errMsg,
        }).catch(() => {});
      }
      return Response.json(
        serverErrorResponse(error),
        {
          status: safeStatus(500),
          headers
        }
      );
    }
  };
};
