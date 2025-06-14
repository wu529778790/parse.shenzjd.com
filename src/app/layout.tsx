import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    "一个简单易用的短视频解析下载工具，支持抖音、快手等平台视频解析和下载",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="一个简单易用的短视频解析下载工具，支持抖音、快手等平台视频解析和下载"
        />
        <meta
          name="keywords"
          content="视频解析, 抖音解析, 快手解析, 视频下载, 视频解析工具, ParseShort"
        />
        <meta name="author" content="ShenZJD" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        <meta name="bingbot" content="index, follow" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
