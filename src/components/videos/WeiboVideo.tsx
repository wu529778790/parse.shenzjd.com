"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, WeiboData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface WeiboVideoProps {
  data: ApiResponse;
}

export default function WeiboVideo({ data }: WeiboVideoProps) {
  if (!data.data) {
    return null;
  }

  const weiboData = data.data as WeiboData;

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {weiboData.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] blur-sm opacity-50" />
              <Image
                src={weiboData.avatar}
                alt={weiboData.author}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {weiboData.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {weiboData.title}
              </h2>
            )}
            {weiboData.author && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">@</span>
                <span className="text-sm font-medium text-accent">{weiboData.author}</span>
              </div>
            )}
            {weiboData.time && (
              <p className="text-xs text-muted mt-1">{weiboData.time}</p>
            )}
          </div>

          {/* Weibo Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] flex items-center justify-center">
              <span className="text-white text-xs font-bold">微博</span>
            </div>
          </div>
        </div>
      </div>

      {/* Video：统一窗口展示（封面 + 复制/新窗口播放） */}
      {weiboData.url && (
        <VideoPosterCard
          url={weiboData.url}
          cover={weiboData.cover}
          alt={weiboData.title || "视频封面"}
          accent="red"
          headline="视频已就绪 🎬"
        />
      )}

      {/* Download Actions：直链新标签 */}
      <div className="flex flex-col sm:flex-row gap-3">
        {weiboData.url && (
          <a
            href={weiboData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#e6162d] to-[#ff4d6a] hover:from-[#c91227] hover:to-[#e6162d] text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#e6162d]/25 hover:-translate-y-0.5">
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
            下载视频
          </a>
        )}

        {weiboData.url && (
          <a
            href={weiboData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-glass-2 hover:bg-glass-3 text-primary rounded-xl font-medium transition-all duration-300 border border-border-subtle">
            <svg
              className="w-5 h-5 text-muted group-hover:text-accent transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            打开原链接
          </a>
        )}
      </div>
    </div>
  );
}
