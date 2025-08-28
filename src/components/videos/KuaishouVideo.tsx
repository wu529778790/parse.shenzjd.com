"use client";
import React, { useState } from "react";
import { ApiResponse, KuaishouData } from "@/types/api";

interface KuaishouVideoProps {
  data: ApiResponse;
}

export default function KuaishouVideo({ data }: KuaishouVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);

  if (!data.data) {
    return null;
  }

  const kuaishouData = data.data as KuaishouData;

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
      {/* 视频标题 */}
      {kuaishouData.caption && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {kuaishouData.caption}
          </h2>
        </div>
      )}

      {/* 视频播放器 */}
      {kuaishouData.photoUrl && (
        <div className="space-y-4">
          <div
            className="relative w-full rounded-lg overflow-hidden"
            style={{ maxWidth: 800 }}>
            <video
              controls
              poster={kuaishouData.coverUrl || undefined}
              className="w-full h-auto bg-black rounded-lg"
              preload="none"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}>
              <source
                src={`/api/proxy?url=${encodeURIComponent(
                  kuaishouData.photoUrl
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
                    href={kuaishouData.photoUrl}
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
                kuaishouData.photoUrl
              )}&filename=${encodeURIComponent(
                kuaishouData.caption || "kuaishou"
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              下载视频
            </a>
          </div>
        </div>
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
    </>
  );
}
