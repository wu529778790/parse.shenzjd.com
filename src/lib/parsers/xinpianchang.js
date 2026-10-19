/**
 * 新片场解析（纯函数模块，无 HTTP 边界）
 * 由 /api/xinpianchang 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

/**
 * 用正则从 HTML 中提取内容（替代 linkedom）
 */
function extractFromHtml(html) {
  const result = {};

  // 提取 __NEXT_DATA__
  const nextDataMatch = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch?.[1]) {
    try {
      const jsonStr = nextDataMatch[1].trim();
      result.nextData = JSON.parse(jsonStr);
    } catch {
      // JSON 解析失败
    }
  }

  return result;
}

async function xinpianchangParse(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.3",
      "Upgrade-Insecure-Requests": "1",
      Referer: "https://www.xinpianchang.com/",
    },
  });
  const html = await res.text();

  const extracted = extractFromHtml(html);

  if (!extracted.nextData) {
    // 2026-10-19 实测：新片场已上线 JS 挑战类反爬（403 + 「Embed Iframe」
    // 渐变挑战页，需真实浏览器执行 JS 才能通过），纯服务端请求一律 403。
    // 区分报错，避免笼统的「无 __NEXT_DATA__」让人误以为是页面结构变化。
    if (res.status === 403 || html.includes("Embed Iframe")) {
      return { code: 400, msg: "新片场反爬拦截，暂时无法解析该链接" };
    }
    return { code: 400, msg: "新片场页面无 __NEXT_DATA__" };
  }

  const data = extracted.nextData?.props?.pageProps?.detail;
  const videoUrl = data?.video?.content?.progressive?.[0]?.url;

  if (!videoUrl) {
    return { code: 404, msg: "未找到新片场视频地址" };
  }

  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: data.title || "",
      author: data.author?.userinfo?.username || "",
      avatar: data.author?.userinfo?.avatar || "",
      cover: data.cover || "",
      url: videoUrl,
    },
  };
}

export default xinpianchangParse;
