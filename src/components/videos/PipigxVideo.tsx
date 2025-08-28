"use client";
import React, { useState } from "react";
import { ApiResponse, PipigxData } from "@/types/api";

interface PipigxVideoProps {
  data: ApiResponse;
}

export default function PipigxVideo({ data }: PipigxVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);

  if (!data.data) {
    return null;
  }

  const pipigxData = data.data as PipigxData;

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
      {pipigxData.title && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {pipigxData.title}
          </h2>
        </div>
      )}
      {pipigxData.video && (
        <div className="space-y-4">
          <div
            className="relative w-full rounded-lg overflow-hidden"
            style={{ maxWidth: 800 }}>
            <video
              controls
              poster={pipigxData.cover}
              className="w-full h-auto bg-black rounded-lg"
              preload="none"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}>
              <source
                src={`/api/proxy?url=${encodeURIComponent(
                  pipigxData.video
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
                    href={pipigxData.video}
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
          <div className="flex items-center justify-between">
            <a
              href={`/api/proxy?url=${encodeURIComponent(
                pipigxData.video
              )}&filename=${encodeURIComponent(pipigxData.title || "pipigx")}`}
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
