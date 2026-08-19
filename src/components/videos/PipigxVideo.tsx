"use client";
import React from "react";
import { ApiResponse, PipigxData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface PipigxVideoProps {
  data: ApiResponse;
}

export default function PipigxVideo({ data }: PipigxVideoProps) {
  if (!data.data) {
    return null;
  }

  const pipigxData = data.data as PipigxData;

  return (
    <>
      {pipigxData.title && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {pipigxData.title}
          </h2>
        </div>
      )}
      {pipigxData.video && (
        <div className="space-y-4">
          <VideoPosterCard
            url={pipigxData.video}
            cover={pipigxData.cover}
            alt={pipigxData.title || "视频封面"}
            accent="blue"
            headline="视频已就绪 🎬"
          />

          {/* 下载按钮：直链新标签 */}
          <div className="flex items-center justify-between">
            <a
              href={pipigxData.video}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              下载视频
            </a>
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              皮皮虾
            </span>
          </div>
        </div>
      )}
    </>
  );
}
