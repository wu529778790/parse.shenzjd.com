import { NextRequest } from "next/server";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("Missing url", { status: 400 });
  }
  const videoRes = await fetch(url, {
    headers: {
      // 伪造 UA 和 Referer，部分视频需要
      "User-Agent": req.headers.get("user-agent") || "",
      Referer: "https://www.douyin.com/",
    },
  });
  // 直接流式转发
  return new Response(videoRes.body, {
    status: videoRes.status,
    headers: {
      "Content-Type": videoRes.headers.get("content-type") || "video/mp4",
    },
  });
}
