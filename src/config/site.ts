// 站点级配置：集中管理联系邮箱、域名等信息
// 修改邮箱时只需改这一处，所有法律页面与页脚会同步更新
export const siteConfig = {
  name: "ParseShort",
  domain: "shenzjd.com",
  url: "https://parse.shenzjd.com",

  // 版权 / 权利通知专用邮箱
  // 请替换为真实可收件的邮箱，版权方投诉会发到这里
  copyrightEmail: "shenzujiudi@gmail.com",

  // 通用联系邮箱
  contactEmail: "shenzujiudi@gmail.com",
} as const;
