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

      {/* Video：封面 + 播放/下载（直链新窗口） */}
      {weiboData.url && (
        <VideoPosterCard
          url={weiboData.url}
          cover={weiboData.cover}
          alt={weiboData.title || "视频封面"}
          accent="red"
        />
      )}
    </div>
  );
}
