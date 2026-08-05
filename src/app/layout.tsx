import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WxAuthInit from "@/components/WxAuthInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://parse.shenzjd.com"),
  title: "ParseShort - 短视频解析下载工具",
  description:
    "支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台的短视频解析与下载工具，即贴即得，免费在线解析无水印视频。",
  keywords: [
    "视频解析",
    "短视频解析",
    "视频下载",
    "无水印视频下载",
    "抖音解析",
    "快手解析",
    "B站解析",
    "微博解析",
    "小红书解析",
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
    "ParseShort",
  ],
  manifest: "/manifest.webmanifest",
  authors: [{ name: "shenzjd.com" }],
  openGraph: {
    title: "ParseShort - 短视频解析下载工具",
    description:
      "支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台短视频解析与下载。",
    url: "https://parse.shenzjd.com",
    siteName: "ParseShort",
    type: "website",
    locale: "zh_CN",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "ParseShort 短视频解析" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ParseShort - 短视频解析下载工具",
    description:
      "支持抖音、快手、B站、微博、小红书、西瓜、虎牙、X 等 24+ 平台短视频解析与下载。",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
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
        <link rel="icon" href="/logo.jpg" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <link rel="canonical" href="https://parse.shenzjd.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <WxAuthInit />
        <div className="min-h-screen flex flex-col noise-overlay">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
