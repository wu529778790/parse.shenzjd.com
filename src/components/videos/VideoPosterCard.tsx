"use client";
import React, { useState } from "react";
import Image from "next/image";
import { buildVideoProxyUrl, isDouyinVideoUrl } from "@/utils/videoProxy";
import { useDouyinVideoUrl } from "@/hooks/useDouyinVideoUrl";

/**
 * 统一视频展示卡片（简化版）：上方封面图 + 下方「播放视频 / 下载视频」两个链接。
 * 各平台复用此卡片，标题/作者等信息由各平台组件自行展示。
 *
 * 防盗链处理：小红书 xhscdn 视频直链有 Referer 防盗链，新窗口打开会 403。
 * 这里对需要代理的直链自动走 /api/video-proxy（带 Referer），保证可播放、可下载。
 *
 * 两种交互模式：
 * - inline=false（默认）：封面/播放/下载均为直链新窗口打开。
 * - inline=true：封面/播放按钮在当前页面内嵌 <video> 播放，下载按钮在当前页面触发真实下载。
 *   适合已走代理的源（如小红书），避免新开标签页，体验更好。
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
  /** 音频直链（可选），存在时额外显示「下载音频」按钮 */
  audioUrl?: string;
  /** 音频按钮文案，默认「下载音频」 */
  audioText?: string;
  /** 是否显示下载按钮，默认 true */
  showDownload?: boolean;
  /** 是否显示「播放视频」按钮（默认 true；false 时封面自带点击 + 下方只剩下载） */
  showPlay?: boolean;
  /** 内嵌播放模式：封面/播放按钮在当前页面内嵌 <video> 播放，下载走代理真实下载（适合已代理的源，如小红书） */
  inline?: boolean;
}

export default function VideoPosterCard({
  url,
  cover,
  alt,
  accent = "neutral",
  tall = false,
  playText = "播放视频",
  downloadText = "下载视频",
  audioUrl,
  audioText = "下载音频",
  showDownload = true,
  showPlay = true,
  inline = false,
}: VideoPosterCardProps) {
  const a = ACCENTS[accent];
  // 内嵌播放状态
  const [playing, setPlaying] = useState(false);
  // 抖音视频：默认直链播放，检测到 ftyp 混淆时回退代理（省服务器流量）
  // 其他平台（小红书等 Referer 防盗链）：直接走代理
  const isDouyin = isDouyinVideoUrl(url);
  const { url: douyinUrl, checking: douyinChecking } = useDouyinVideoUrl(url);
  const playUrl = isDouyin ? douyinUrl : buildVideoProxyUrl(url);

  // 内嵌模式：点击封面/播放按钮切换为 <video> 播放器
  const handleInlinePlay = () => setPlaying(true);

  return (
    <div className="space-y-3">
      {/* 封面图 / 内嵌播放器 */}
      {cover && !playing && (
        <a
          href={inline ? undefined : playUrl}
          target={inline ? undefined : "_blank"}
          rel={inline ? undefined : "noopener noreferrer"}
          onClick={inline ? handleInlinePlay : undefined}
          className="group block rounded-2xl overflow-hidden bg-black cursor-pointer">
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
            {/* 中心播放图标：提示用户可点击封面播放，hover 时轻微放大 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/15 transition-colors duration-300">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 group-hover:bg-white text-black flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110">
                <svg
                  className="w-7 h-7 sm:w-9 sm:h-9 ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </a>
      )}

      {/* 内嵌播放器（inline 模式点击播放后展示） */}
      {inline && playing && !douyinChecking && (
        <div className="rounded-2xl overflow-hidden bg-black">
          <video
            src={playUrl}
            controls
            autoPlay
            playsInline
            className={`w-full ${
              tall ? "aspect-[9/16] sm:aspect-video" : "aspect-video"
            } object-contain`}
          />
        </div>
      )}

      {/* 操作按钮：播放 / 下载（内嵌模式下封面点击即可播放，只保留下载按钮） */}
      <div className="flex flex-col sm:flex-row gap-3">
        {showPlay && !inline && (
          <a
            href={douyinChecking ? undefined : playUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={douyinChecking}
            className={`group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r ${a.gradient} ${a.hover} text-white rounded-xl font-medium transition-all duration-300 ${a.shadow} hover:-translate-y-0.5 flex-1 ${douyinChecking ? "opacity-60 pointer-events-none" : ""}`}>
            {douyinChecking ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
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
            )}
            {douyinChecking ? "检测中…" : playText}
          </a>
        )}

        {showDownload && (
          <a
            href={douyinChecking ? undefined : playUrl}
            target={inline ? undefined : "_blank"}
            rel={inline ? undefined : "noopener noreferrer"}
            download={inline}
            aria-disabled={douyinChecking}
            className={`group inline-flex items-center justify-center gap-2 px-6 py-3 bg-glass-2 hover:bg-glass-3 text-primary rounded-xl font-medium transition-all duration-300 border border-border-subtle hover:-translate-y-0.5 flex-1 ${douyinChecking ? "opacity-60 pointer-events-none" : ""}`}>
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
            {douyinChecking ? "检测中…" : downloadText}
          </a>
        )}

        {/* 音频下载：与视频下载同款式（中性描边），点击新窗口打开音频直链 */}
        {audioUrl && (
          <a
            href={audioUrl}
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
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
            {audioText}
          </a>
        )}
      </div>
    </div>
  );
}