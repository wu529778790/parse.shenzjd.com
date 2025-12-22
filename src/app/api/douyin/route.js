export const runtime = "edge";

// 缓存相关配置
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
let cache = new Map();

const getCachedResponse = (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

const setCacheResponse = (url, data) => {
  cache.set(url, {
    data,
    timestamp: Date.now()
  });
};

// 速率限制相关配置
const rateLimit = (() => {
  const requests = new Map();
  const WINDOW_SIZE = 60000; // 1分钟
  const MAX_REQUESTS = 10; // 每分钟最多10次请求

  return (ip) => {
    const now = Date.now();
    const userRequests = requests.get(ip) || [];

    // 清理过期请求
    const recentRequests = userRequests.filter(time => now - time < WINDOW_SIZE);

    if (recentRequests.length >= MAX_REQUESTS) {
      return false; // 超出限制
    }

    recentRequests.push(now);
    requests.set(ip, recentRequests);
    return true; // 允许请求
  };
})();

async function douyin(url) {
  try {
    // 检查缓存
    const cached = getCachedResponse(url);
    if (cached) {
      return cached;
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
      Referer: "https://www.douyin.com/",
      Origin: "https://www.douyin.com",
      "sec-ch-ua":
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"iOS"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      Host: "www.iesdouyin.com",
      TE: "Trailers",
      Pragma: "no-cache",
      DNT: "1",
      "sec-ch-ua-arch": '"arm"',
      "sec-ch-ua-full-version-list":
        '"Chromium";v="120.0.6099.224", "Not_A Brand";v="99.0.0.0"',
      "sec-ch-ua-model": '"iPhone"',
      "sec-ch-ua-platform-version": '"16.6.0"',
      "sec-ch-ua-bitness": '"64"',
      "sec-ch-ua-wow64": "?0",
      "X-Forwarded-For": "36.112.123.123",
      "X-Real-IP": "36.112.123.123",
      Cookie:
        "msToken=abcdefghijklmnopqrstuvwxyz123456; odin_tt=abcdefghijklmnopqrstuvwxyz123456",
    };
    let id = await extractId(url);
    if (!id) {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        credentials: "include",
      });
      const html = await response.text();
      const redirectUrl = getRedirectUrl(html);
      if (redirectUrl) {
        id = await extractId(redirectUrl);
      }
    }
    if (!id) {
      return {
        code: 400,
        msg: "无法解析视频 ID：请确保链接格式正确且视频可访问",
      };
    }
    const response = await fetch(
      `https://www.iesdouyin.com/share/video/${id}`,
      { headers }
    );
    const html = await response.text();

    // 检查是否被重定向到国际版
    if (html.includes("tiktok.com") || html.includes("访问受限")) {
      return {
        code: 403,
        msg: "解析失败：当前服务器IP无法访问抖音，请使用代理服务器或更换部署区域",
      };
    }

    const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s;
    const matches = html.match(pattern);
    if (!matches || !matches[1]) {
      console.log("No _ROUTER_DATA found in HTML");
      return {
        code: 201,
        msg: "解析失败：未能从页面获取视频数据，可能是页面结构变化、接口受限或视频已被删除",
      };
    }
    const videoInfo = JSON.parse(matches[1].trim());
    console.log("videoInfo:", JSON.stringify(videoInfo, null, 2));
    if (!videoInfo.loaderData) {
      return {
        code: 201,
        msg: "解析失败：视频数据结构异常，可能是抖音接口发生变化",
      };
    }
    try {
      const videoData =
        videoInfo.loaderData["video_(id)/page"]?.videoInfoRes?.item_list?.[0];
      if (!videoData) {
        return {
          code: 201,
          msg: "解析失败：无法从数据中找到视频信息",
        };
      }

      // 检查必要字段是否存在
      if (!videoData.author) {
        return {
          code: 201,
          msg: "解析失败：视频作者信息缺失",
        };
      }

      if (!videoData.video?.play_addr?.url_list?.[0]) {
        return {
          code: 201,
          msg: "解析失败：视频播放地址缺失",
        };
      }

      const videoResUrl = videoData.video.play_addr.url_list[0].replace(
        "playwm",
        "play"
      );

      const result = {
        code: 200,
        msg: "解析成功",
        data: {
          author: videoData.author.nickname || "未知作者",
          uid: videoData.author.unique_id || "",
          avatar: videoData.author.avatar_medium?.url_list?.[0] || "",
          like: videoData.statistics?.digg_count || 0,
          time: videoData.create_time || 0,
          title: videoData.desc || "无标题",
          cover: videoData.video.cover?.url_list?.[0] || "",
          url: videoResUrl,
          music: {
            author: videoData.music?.author || "未知音乐作者",
            avatar: videoData.music?.cover_large?.url_list?.[0] || "",
          },
        },
      };

      // 设置缓存
      setCacheResponse(url, result);

      return result;
    } catch (error) {
      console.error("Error parsing video data:", error);
      return { code: 500, msg: `服务器错误：${error.message || "未知错误"}` };
    }
  } catch (error) {
    console.error("Error in douyin function:", error);
    return { code: 500, msg: `服务器错误：${error.message || "未知错误"}` };
  }
}

async function extractId(url) {
  try {
    // Edge Runtime 下用 fetch
    const response = await fetch(url, { redirect: "follow" });
    const finalUrl = response.url || url;
    // 优先从 URL 里找 video/1234567890
    let match = finalUrl.match(/video\/(\d+)/);
    if (match) return match[1];
    // 其次尝试直接找数字串
    match = finalUrl.match(/(\d{10,})/);
    if (match) return match[1];
    // 最后从 HTML 里找 canonical
    const html = await response.text();
    const canonicalMatch = html.match(
      /href="https:\/\/www\\.iesdouyin\\.com\/share\/video\/(\d+)"/
    );
    if (canonicalMatch) return canonicalMatch[1];
    return null;
  } catch (error) {
    console.error("Error extracting ID:", error);
    return null;
  }
}

function getRedirectUrl(html) {
  const pattern = /<link data-react-helmet="true" rel="canonical" href="(.*?)"/;
  const match = html.match(pattern);
  return match ? match[1] : null;
}

export async function GET(request) {
  // 获取客户端IP
  const clientIP = request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  request.headers.get('cf-connecting-ip') ||
                  'unknown';

  // 检查速率限制
  if (!rateLimit(clientIP)) {
    return Response.json(
      { code: 429, msg: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { code: 201, msg: "url为空" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  // 验证URL格式
  try {
    new URL(url);
  } catch (error) {
    console.warn('Invalid URL provided:', error);
    return Response.json(
      { code: 400, msg: "无效的URL格式" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  try {
    const response = await douyin(url);
    if (!response) {
      return Response.json(
        { code: 404, msg: "获取失败" },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
    return Response.json(response, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    return Response.json(
      { code: 500, msg: "服务器错误", error: error.message || "未知错误" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
