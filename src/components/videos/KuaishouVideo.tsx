"use client";
import React from "react";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface KuaishouVideoProps {
  data: ApiResponse;
}

export default function KuaishouVideo({ data }: KuaishouVideoProps) {
  if (!data.data) {
    return null;
  }

  const kuaishouData = data.data as ParseData;

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Info */}
      {kuaishouData.author && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff6600] to-[#ff9933] flex items-center justify-center">
              <span className="text-white text-sm font-bold">快</span>
            </div>
            <div>
              <p className="text-xs text-muted">作者</p>
              <p className="text-sm font-medium text-primary">{kuaishouData.author}</p>
            </div>
          </div>
        </div>
      )}

      {/* Video Title */}
      {kuaishouData.title && (
        <div className="glass-card p-4">
          <p className="text-sm text-primary line-clamp-2">{kuaishouData.title}</p>
        </div>
      )}

      {/* Video：封面 + 播放/下载（直链新窗口） */}
      {kuaishouData.url && (
        <VideoPosterCard
          url={kuaishouData.url}
          cover={kuaishouData.cover || undefined}
          alt={kuaishouData.title || "视频封面"}
          accent="orange"
          tall
        />
      )}
    </div>
  );
}
