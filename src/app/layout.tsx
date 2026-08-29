import type { Metadata, Viewport } from "next";
import "./globals.css";
import Footer from "@/components/Footer";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} - 短视频解析下载工具`,
    template: `%s - ${siteConfig.name}`,
  },
  description:
    "在线免费短视频解析工具，支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台，粘贴链接即得无水印视频下载地址，无需安装、即贴即用。",
  keywords: [
    "视频解析",
    "短视频解析",
    "视频下载",
    "无水印视频下载",
    "去水印",
    "视频去水印",
    "抖音解析",
    "抖音去水印",
    "抖音视频下载",
    "快手解析",
    "快手去水印",
    "B站解析",
    "bilibili解析",
    "微博解析",
    "微博视频下载",
    "小红书解析",
    "小红书视频下载",
    "西瓜视频解析",
    "虎牙解析",
    "皮皮虾解析",
    "微视解析",
    "火山解析",
    "梨视频解析",
    "AcFun解析",
    "美拍解析",
    "全民K歌解析",
    "X视频解析",
    "Twitter解析",
    "视频解析工具",
    "免费视频解析",
    "在线视频解析",
    siteConfig.name,
  ],
  manifest: "/manifest.webmanifest",
  authors: [{ name: siteConfig.domain }],
  openGraph: {
    title: `${siteConfig.name} - 短视频解析下载工具`,
    description:
      "免费在线短视频解析，支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台，粘贴链接即得无水印视频下载地址。",
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    locale: "zh_CN",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: `${siteConfig.name} 短视频解析` },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - 短视频解析下载工具`,
    description:
      "免费在线短视频解析，支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台，粘贴链接即得无水印视频下载地址。",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: siteConfig.url,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="https://cdn.jsdmirror.com/gh/wu529778790/img.shenzjd.com@master/blog/imgx-20260828-215653-2ha5.svg" />
        <link rel="apple-touch-icon" href="https://cdn.jsdmirror.com/gh/wu529778790/img.shenzjd.com@master/blog/imgx-20260828-220754-822r.png" />
        {/* 右侧悬浮公众号+赞赏码浮窗：@wu529778790/floating-qr Web Component 版
            一行 <script> 引入，自动注册 <floating-qr> 并注入默认浮窗（right-center，
            默认隐藏移动端、关闭后刷新重现），无需额外标签/JS */}
        <script
          src="https://unpkg.com/@wu529778790/floating-qr@latest/dist/floating-qr.wc.js"
          defer
        />
        {/* 顶部导航 + 头像浮窗：@wu529778790/site-navbar Web Component 版
            1. 先引入 wx-auth-sdk UMD（不锁版本，跟随最新；头像登录依赖 window.WxAuth）
            2. 弹窗样式随 SDK 版本走，需同步引入 wx-auth.css
            3. 静默校验登录态（silent:true 绝不自动弹窗；required:false 弹窗带 × 关闭按钮）
            4. 再引入 site-navbar（头像已内置，无需再引 user-avatar）
            5. body 顶部放一个 <site-navbar> 标签即出现整条导航
            解析主流程的登录弹窗由 src/lib/wx-auth-client.ts 复用同一全局实例触发 */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/wx-auth-sdk/dist/wx-auth.css"
        />
        <script src="https://unpkg.com/wx-auth-sdk/dist/wx-auth.umd.js" defer />
        <script
          defer
          dangerouslySetInnerHTML={{
            __html: `WxAuth.init({ silent: true, required: false })`,
          }}
        />
        <script
          src="https://unpkg.com/@wu529778790/site-navbar@latest/dist/site-navbar.wc.js"
          defer
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: siteConfig.name,
              url: siteConfig.url,
              applicationCategory: "UtilityApplication",
              operatingSystem: "Any",
              description:
                "免费在线短视频解析工具，支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台，粘贴链接即得无水印视频下载地址。",
              inLanguage: "zh-CN",
              offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
            }),
          }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col noise-overlay">
        <site-navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
