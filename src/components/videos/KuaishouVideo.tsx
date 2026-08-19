"use client";
import React from "react";
import { ApiResponse, KuaishouData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface KuaishouVideoProps {
  data: ApiResponse;
}

export default function KuaishouVideo({ data }: KuaishouVideoProps) {
  if (!data.data) {
    return null;
  }

  const kuaishouData = data.data as KuaishouData;

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Info */}
      {kuaishouData.authorName && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff6600] to-[#ff9933] flex items-center justify-center">
              <span className="text-white text-sm font-bold">快</span>
            </div>
            <div>
              <p className="text-xs text-muted">作者</p>
              <p className="text-sm font-medium text-primary">{kuaishouData.authorName}</p>
            </div>
          </div>
        </div>
      )}

      {/* Video Title */}
      {kuaishouData.caption && (
        <div className="glass-card p-4">
          <p className="text-sm text-primary line-clamp-2">{kuaishouData.caption}</p>
        </div>
      )}

      {/* Video：统一窗口展示（封面 + 复制/新窗口播放） */}
      {kuaishouData.photoUrl && (
        <VideoPosterCard
          url={kuaishouData.photoUrl}
          cover={kuaishouData.coverUrl || undefined}
          alt={kuaishouData.caption || "视频封面"}
          accent="orange"
          tall
          headline="视频已就绪 🎬"
        />
      )}

      {/* Download Button：直链新标签 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={kuaishouData.photoUrl || ""}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff6600] to-[#ff9933] hover:from-[#e65c00] hover:to-[#ff8800] text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/25 hover:-translate-y-0.5">
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

        {kuaishouData.photoUrl && (
          <a
            href={kuaishouData.photoUrl}
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
