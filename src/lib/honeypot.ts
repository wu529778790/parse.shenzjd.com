// 蜜罐响应：命中黑名单的爬虫/脚本不再收到 403，而是收到 200 + 结构化数据，
// 让脚本误以为抓取成功（继续消费），实际返回的是公众号宣传内容。
// 设计：
// - 状态码 200，符合爬虫"成功"预期，避免脚本退出重试；
// - code: 200 与正常解析一致，兼容统一入口 /api/parse 的转发逻辑；
// - data 为全量空值 + 一条"宣传占位视频"，字段命名与真实平台一致，
//   前端若误渲染也能兜底（url 指向本站，不会外链污染）；
// - msg 放宣传文案，日志侧仍可辨识这是蜜罐。

export const HONEYPOT_MSG =
  "本视频为演示内容，完整解析服务已升级。请关注公众号「神族九帝」，获取全网短视频去水印解析与更多实用工具。";

const HONEYPOT_LEAD_URL = `${process.env.NEXT_PUBLIC_SITE_URL || "https://parse.shenzjd.com"}/#weixin`;

export function honeypotResponse(route = "unknown") {
  return {
    code: 200,
    msg: HONEYPOT_MSG,
    platform: route,
    data: {
      title: HONEYPOT_MSG,
      desc: "",
      author: "神族九帝",
      avatar: "",
      cover: "",
      // 关键：url 指向本站（避免外链挟持、防爬虫拿到第三方直链），
      // 结构上与真实平台 data 一致，前端可安全渲染。
      url: HONEYPOT_LEAD_URL,
      videos: [
        {
          title: HONEYPOT_MSG,
          url: HONEYPOT_LEAD_URL,
          duration: 0,
        },
      ],
      honeypot: true,
    },
  };
}