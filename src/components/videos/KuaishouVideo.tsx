"use client";
import React from "react";
import Image from "next/image";
import { ApiResponse, KuaishouData } from "@/types/api";

interface KuaishouVideoProps {
  data: ApiResponse;
}

export default function KuaishouVideo({ data }: KuaishouVideoProps) {
  if (!data.data) {
    return null;
  }

  const kuaishouData = data.data as KuaishouData;

  return (
    <>
      {/* 视频标题 */}
      {kuaishouData.caption && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {kuaishouData.caption}
          </h2>
        </div>
      )}

      {/* 视频封面和播放链接 */}
      {kuaishouData.photoUrl && (
        <a
          href={kuaishouData.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block relative w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden group cursor-pointer"
          style={{ maxWidth: 800 }}>
          <Image
            src={kuaishouData.coverUrl || "/placeholder-cover.jpg"}
            alt={kuaishouData.caption || "快手视频封面"}
            fill
            sizes="(max-width: 800px) 100vw, 800px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority
            unoptimized
          />
          <div className="absolute inset-0 flex items-center justify-center group-hover:bg-opacity-10 transition-all">
            <svg
              className="w-20 h-20 text-white opacity-70 group-hover:opacity-90 transition-opacity drop-shadow-lg"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"></path>
            </svg>
          </div>
        </a>
      )}

      {/* 作者信息（如果有的话） */}
      {kuaishouData.authorName && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">快</span>
            </div>
            <span className="text-gray-600 dark:text-gray-300 text-sm">
              {kuaishouData.authorName}
            </span>
          </div>
        </div>
      )}

      {/* 数据来源标识 */}
      <div className="text-center">
        <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
          快手
        </span>
        {kuaishouData.source && (
          <span className="inline-block ml-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
            {kuaishouData.source}
          </span>
        )}
      </div>
    </>
  );
}
