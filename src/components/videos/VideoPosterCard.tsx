"use client";
import React from "react";
import Image from "next/image";

/**
 * 统一视频展示卡片（简化版）：上方封面图 + 下方「播放视频 / 下载视频」两个链接。
 * 不直接 <video> 播放，避免服务器出口 IP（海外）分配的 CDN 节点在大陆无法播放。
 * 各平台复用此卡片，标题/作者等信息由各平台组件自行展示。
 */

type AccentKey = "blue" | "red" | "orange" | "pink" | "neutral" | "purple";

const ACCENTS: Record<
  AccentKey,
  { gradient: string; hover: string; shadow: string }
> = {
  // B站 / 皮皮虾 / 皮皮搞笑
  blue: {
    gradient: "from-[#00aeec] to-[#4dc9ff]",
    hover: "hover:from-[#0099d4] hover:to-[#3db8e8]",
    shadow: "hover:shadow-[#00aeec]/25",
  },
  // 微博
  red: {
    gradient: "from-[#e6162d] to-[#ff4d6a]",
    hover: "hover:from-[#c91227] hover:to-[#e6162d]",
    shadow: "hover:shadow-[#e6162d]/25",
  },
  // 快手
  orange: {
    gradient: "from-[#ff6600] to-[#ff9933]",
    hover: "hover:from-[#e65c00] hover:to-[#ff8800]",
    shadow: "hover:shadow-orange-500/25",
  },
  // 小红书
  pink: {
    gradient: "from-[#ff2442] to-[#ff5c7c]",
    hover: "hover:from-[#e61f3a] hover:to-[#ff4d6a]",
    shadow: "hover:shadow-[#ff2442]/25",
  },
  // 通用平台
  neutral: {
    gradient: "from-neutral-500 to-neutral-400",
    hover: "hover:from-neutral-600 hover:to-neutral-500",
    shadow: "hover:shadow-black/25",
  },
  // QQ音乐
  purple: {
    gradient: "from-purple-500 to-pink-500",
    hover: "hover:from-purple-600 hover:to-pink-600",
    shadow: "hover:shadow-purple-500/25",
  },
};

interface VideoPosterCardProps {
  /** 视频直链 */
  url: string;
  /** 封面图地址（可选，无封面时只显示按钮行） */
  cover?: string;
  /** 封面 alt */
  alt?: string;
  /** 品牌色 */
  accent?: AccentKey;
  /** 竖屏视频封面用 9:16，默认宽屏 16:9 */
  tall?: boolean;
  /** 播放按钮文案，默认「播放视频」 */
  playText?: string;
  /** 下载按钮文案，默认「下载视频」 */
  downloadText?: string;
  /** 是否显示下载按钮，默认 true */
  showDownload?: boolean;
}

export default function VideoPosterCard({
  url,
  cover,
  alt,
  accent = "neutral",
  tall = false,
  playText = "播放视频",
  downloadText = "下载视频",
  showDownload = true,
}: VideoPosterCardProps) {
  const a = ACCENTS[accent];

  return (
    <div className="space-y-3">
      {/* 封面图（点击在新窗口打开直链） */}
      {cover && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl overflow-hidden bg-black">
          <div
            className={`relative w-full ${
              tall ? "aspect-[9/16] sm:aspect-video" : "aspect-video"
            }`}>
            <Image
              src={cover}
              alt={alt || "视频封面"}
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </a>
      )}

      {/* 操作链接：播放 / 下载（均为直链新窗口） */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r ${a.gradient} ${a.hover} text-white rounded-xl font-medium transition-all duration-300 ${a.shadow} hover:-translate-y-0.5 flex-1`}>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
          {playText}
        </a>

        {showDownload && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-glass-2 hover:bg-glass-3 text-primary rounded-xl font-medium transition-all duration-300 border border-border-subtle hover:-translate-y-0.5 flex-1">
            <svg
              className="w-5 h-5 transition-transform group-hover:scale-110"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {downloadText}
          </a>
        )}
      </div>
    </div>
  );
}
