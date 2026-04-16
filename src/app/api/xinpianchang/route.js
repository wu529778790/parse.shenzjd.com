import { parseHTML } from "linkedom";
import { createApiHandler } from "@/lib/api-middleware";

export const runtime = "nodejs";

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
  const { document } = parseHTML(html);
  const el = document.querySelector("#__NEXT_DATA__");
  const videoJson = el?.textContent?.trim();
  if (!videoJson) {
    return { code: 400, msg: "新片场页面无 __NEXT_DATA__" };
  }
  let root;
  try {
    root = JSON.parse(videoJson);
  } catch {
    return { code: 400, msg: "新片场 JSON 解析失败" };
  }
  const data = root?.props?.pageProps?.detail;
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

export const GET = createApiHandler(xinpianchangParse);
