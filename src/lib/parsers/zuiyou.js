/**
 * 最右解析（纯函数模块，无 HTTP 边界）
 * 由 /api/zuiyou 路由与统一入口 /api/parse 直接函数调用；
 * 逻辑原样下沉自路由文件，行为未改动。
 */

import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";


async function zuiyouParse(shareUrl) {
  let pid = "";
  try {
    pid = new URL(shareUrl).searchParams.get("pid") || "";
  } catch {
    return { code: 400, msg: "链接无效" };
  }
  if (!pid) {
    return { code: 400, msg: "无法解析最右 pid" };
  }
  const intPid = parseInt(pid, 10);
  if (Number.isNaN(intPid)) {
    return { code: 400, msg: "pid 不是数字" };
  }

  const res = await fetch(
    "https://share.xiaochuankeji.cn/planck/share/post/detail_h5",
    {
      method: "POST",
      headers: {
        "User-Agent": DEFAULT_MOBILE_UA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ h_av: "5.2.13.011", pid: intPid }),
    }
  );
  const json = await res.json();
  const post = json?.data?.post;
  if (!post) {
    return { code: 404, msg: "未找到帖子数据" };
  }
  const videoKey = post.imgs?.[0]?.id;
  const videoPlayAddr = videoKey
    ? post.videos?.[String(videoKey)]?.url
    : "";
  const videoCover = videoKey
    ? post.videos?.[String(videoKey)]?.cover_urls?.[0]
    : "";
  if (!videoPlayAddr) {
    return { code: 404, msg: "未找到视频地址" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: post.content || "",
      author: post.member?.name || "",
      avatar: post.member?.avatar_urls?.origin?.urls?.[0] || "",
      cover: videoCover || "",
      url: videoPlayAddr,
    },
  };
}

export default zuiyouParse;
