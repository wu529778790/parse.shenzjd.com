export const runtime = "nodejs";

import puppeteer from "puppeteer";

async function douyin(url) {
  try {
    const launchOptions = {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    };
    if (process.env.CHROME_PATH) {
      launchOptions.executablePath = process.env.CHROME_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const finalUrl = page.url();
    // 优先从 URL 里找 video/1234567890
    let match = finalUrl.match(/video\/(\d+)/);
    let id = match ? match[1] : null;
    if (!id) {
      // 其次尝试直接找数字串
      match = finalUrl.match(/(\d{10,})/);
      if (match) id = match[1];
    }
    if (!id) {
      // 最后从 HTML 里找 canonical
      const html = await page.content();
      const canonicalMatch = html.match(
        /href=\"https:\/\/www\\.iesdouyin\\.com\/share\/video\/(\d+)\"/
      );
      if (canonicalMatch) id = canonicalMatch[1];
    }
    if (!id) {
      await browser.close();
      return {
        code: 400,
        msg: "无法解析视频 ID：请确保链接格式正确且视频可访问",
      };
    }
    // 访问视频详情页
    const videoUrl = `https://www.iesdouyin.com/share/video/${id}`;
    await page.goto(videoUrl, { waitUntil: "networkidle2", timeout: 30000 });
    const html = await page.content();
    // 检查是否被重定向到国际版
    if (html.includes("tiktok.com") || html.includes("访问受限")) {
      await browser.close();
      return {
        code: 403,
        msg: "解析失败：当前服务器IP无法访问抖音，请使用代理服务器或更换部署区域",
      };
    }
    const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s;
    const matches = html.match(pattern);
    if (!matches || !matches[1]) {
      await browser.close();
      return {
        code: 201,
        msg: "解析失败：未能从页面获取视频数据，可能是页面结构变化、接口受限或视频已被删除",
      };
    }
    const videoInfo = JSON.parse(matches[1].trim());
    if (!videoInfo.loaderData) {
      await browser.close();
      return {
        code: 201,
        msg: "解析失败：视频数据结构异常，可能是抖音接口发生变化",
      };
    }
    const videoResUrl = videoInfo.loaderData[
      "video_(id)/page"
    ].videoInfoRes.item_list[0].video.play_addr.url_list[0].replace(
      "playwm",
      "play"
    );
    const result = {
      code: 200,
      msg: "解析成功",
      data: {
        author:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .author.nickname,
        uid: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .author.unique_id,
        avatar:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .author.avatar_medium.url_list[0],
        like: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .statistics.digg_count,
        time: videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
          .create_time,
        title:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .desc,
        cover:
          videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
            .video.cover.url_list[0],
        url: videoResUrl,
        music: {
          author:
            videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
              .music.author,
          avatar:
            videoInfo.loaderData["video_(id)/page"].videoInfoRes.item_list[0]
              .music.cover_large.url_list[0],
        },
      },
    };
    await browser.close();
    return result;
  } catch (error) {
    return { code: 500, msg: `服务器错误：${error.message || "未知错误"}` };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json(
      { code: 201, msg: "url为空" },
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
      { code: 500, msg: "服务器错误", error: error },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
