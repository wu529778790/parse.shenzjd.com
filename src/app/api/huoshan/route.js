import { createApiHandler } from "@/lib/api-middleware";
import { DEFAULT_MOBILE_UA } from "@/lib/default-mobile-ua";
import { getRedirectLocation } from "@/lib/redirect-location";

export const runtime = "nodejs";

const headers = { "User-Agent": DEFAULT_MOBILE_UA };

async function parseVideoId(itemId) {
  const reqUrl = `https://share.huoshan.com/api/item/info?item_id=${itemId}`;
  const res = await fetch(reqUrl, { headers });
  const json = await res.json();
  const data = json?.data?.item_info;
  if (!data?.url) {
    return { code: 400, msg: "火山解析失败" };
  }
  return {
    code: 200,
    msg: "解析成功",
    data: {
      title: "",
      author: "",
      avatar: "",
      cover: data.cover || "",
      url: data.url,
    },
  };
}

async function huoshanParse(url) {
  const loc = await getRedirectLocation(url, headers);
  if (!loc) {
    return { code: 400, msg: "无法获取火山短链重定向" };
  }
  let itemId = "";
  try {
    itemId = new URL(loc).searchParams.get("item_id") || "";
  } catch {
    return { code: 400, msg: "短链地址无效" };
  }
  if (!itemId) {
    return { code: 400, msg: "无法从分享链接解析 item_id" };
  }
  return parseVideoId(itemId);
}

export const GET = createApiHandler(huoshanParse);
