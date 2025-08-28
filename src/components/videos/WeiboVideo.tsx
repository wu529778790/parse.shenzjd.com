"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, WeiboData } from "@/types/api";

interface WeiboVideoProps {
  data: ApiResponse;
}

export default function WeiboVideo({ data }: WeiboVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);

  if (!data.data) {
    return null;
  }

  const weiboData = data.data as WeiboData;

  const handleVideoError = (
    e: React.SyntheticEvent<HTMLVideoElement, Event>
  ) => {
    const video = e.currentTarget;
    setVideoError(`视频加载失败: ${video.error?.message || "网络错误"}`);
  };

  const handleVideoLoad = () => {
    setVideoError(null);
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {weiboData.avatar && (
          <Image
            src={weiboData.avatar}
            alt={weiboData.author}
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {weiboData.title}
          </h2>
          {weiboData.author && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {weiboData.author}
            </p>
          )}
          {weiboData.time && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-left">
              {weiboData.time}
            </p>
          )}
        </div>
      </div>
      {weiboData.url && (
        <div className="space-y-4">
          <div
            className="relative w-full rounded-lg overflow-hidden"
            style={{ maxWidth: 800 }}>
            <video
              controls
              poster={weiboData.cover}
              className="w-full h-auto bg-black rounded-lg"
              preload="none"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}>
              <source
                src={`/api/proxy?url=${encodeURIComponent(
                  weiboData.url
                )}&disposition=inline`}
                type="video/mp4"
              />
              <p className="text-center text-gray-500 p-4">
                您的浏览器不支持视频播放
              </p>
            </video>

            {videoError && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center text-white p-4">
                  <p className="mb-4">{videoError}</p>
                  <a
                    href={weiboData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                    在新窗口打开
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* 下载按钮 */}
          <div>
            <a
              href={`/api/proxy?url=${encodeURIComponent(
                weiboData.url
              )}&filename=${encodeURIComponent(weiboData.title || "weibo")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              下载视频
            </a>
          </div>
        </div>
      )}
    </>
  );
}
