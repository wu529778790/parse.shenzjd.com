"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, PpxiaData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";

interface PpxiaVideoProps {
  data: ApiResponse;
}

export default function PpxiaVideo({ data }: PpxiaVideoProps) {
  if (!data.data) {
    return null;
  }

  const ppxiaData = data.data as PpxiaData;

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {ppxiaData.avatar && (
          <Image
            src={ppxiaData.avatar}
            alt={ppxiaData.author}
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {ppxiaData.title}
          </h2>
          {ppxiaData.author && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {ppxiaData.author}
            </p>
          )}
        </div>
      </div>
      {ppxiaData.url && (
        <div className="space-y-4">
          <VideoPosterCard
            url={ppxiaData.url}
            cover={ppxiaData.cover}
            alt={ppxiaData.title || "视频封面"}
            accent="blue"
            headline="视频已就绪 🎬"
          />

          {/* 下载按钮：直链新标签 */}
          <div className="flex items-center justify-between">
            <a
              href={ppxiaData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              下载视频
            </a>
            <span className="inline-block px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full">
              皮皮虾
            </span>
          </div>
        </div>
      )}
    </>
  );
}
