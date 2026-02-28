import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ParseShort - 短视频解析下载工具",
  description:
    "一个简单易用的短视频解析下载工具，支持抖音、快手、B站、小红书等平台视频解析和下载",
  keywords: [
    "视频解析",
    "抖音解析",
    "快手解析",
    "B站解析",
    "小红书解析",
    "视频下载",
    "视频解析工具",
    "ParseShort",
  ],
  authors: [{ name: "shenzjd.com" }],
  openGraph: {
    title: "ParseShort - 短视频解析下载工具",
    description: "支持抖音、快手、B站、小红书等平台视频解析和下载",
    url: "https://parse.shenzjd.com",
    siteName: "ParseShort",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "ParseShort - 短视频解析下载工具",
    description: "支持抖音、快手、B站、小红书等平台视频解析和下载",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
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
        <link rel="canonical" href="https://parse.shenzjd.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen flex flex-col noise-overlay">
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
