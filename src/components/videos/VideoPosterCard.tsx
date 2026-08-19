"use client";
import React, { useState } from "react";
import Image from "next/image";

/**
 * 统一视频展示卡片（窗口模式）：封面 + 遮罩 + 复制链接 / 新窗口播放。
 * 不直接 <video> 播放，避免服务器出口 IP（海外）分配的 CDN 节点在大陆无法播放。
 * 所有平台组件复用此卡片，保证交互一致。
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
  /** 封面图地址（可选，无封面时显示纯黑背景） */
  cover?: string;
  /** 封面 alt / 卡片语义 */
  alt?: string;
  /** 品牌色 */
  accent?: AccentKey;
  /** 竖屏视频用 9:16，默认宽屏 16:9 */
  tall?: boolean;
  /** 遮罩上的标题文案，默认「视频已就绪 🎬」 */
  headline?: string;
}

export default function VideoPosterCard({
  url,
  cover,
  alt,
  accent = "neutral",
  tall = false,
  headline = "视频已就绪 🎬",
}: VideoPosterCardProps) {
  const [copied, setCopied] = useState(false);
  const a = ACCENTS[accent];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：旧浏览器 / 非安全上下文
      try {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt("请手动复制视频链接：", url);
      }
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
      <div
        className={`w-full relative ${
          tall ? "aspect-[9/16] sm:aspect-video" : "aspect-video"
        }`}>
        {cover ? (
          <Image
            src={cover}
            alt={alt || "视频封面"}
            fill
            className="object-contain"
            unoptimized
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-black" />
        )}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-6 gap-3">
          <svg
            className="w-12 h-12 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-base font-medium mb-1">{headline}</p>
            <p className="text-sm text-gray-300">
              点击按钮在新窗口打开视频
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button
              onClick={handleCopy}
              className={`group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:-translate-y-0.5 ${
                copied
                  ? "bg-green-600 hover:bg-green-600 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
              }`}>
              <svg
                className="w-5 h-5 transition-transform group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}>
                {copied ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                ) : (
                  <>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3"
                    />
                  </>
                )}
              </svg>
              {copied ? "已复制 ✓" : "复制链接"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r ${a.gradient} ${a.hover} text-white rounded-xl font-medium transition-all duration-300 ${a.shadow} hover:-translate-y-0.5`}>
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
              新窗口播放
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
