"use client";
import React, { useState } from "react";
import { ApiResponse, DouyinData } from "@/types/api";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);
  
  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(douyinData.url)}&disposition=inline`;

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    setVideoError(`视频加载失败: ${video.error?.message || '网络错误'}`);
  };

  const handleVideoLoad = () => {
    setVideoError(null);
  };

  return (
    <>
      {douyinData.url && (
        <div className="space-y-4">
          <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ maxWidth: 800 }}>
            <video
              controls
              poster={douyinData.cover}
              className="w-full h-auto"
              preload="none"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}
            >
              <source src={proxyUrl} type="video/mp4" />
              <p className="text-center text-gray-500 p-4">
                您的浏览器不支持视频播放
              </p>
            </video>
            
            {videoError && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center text-white p-4">
                  <p className="mb-4">{videoError}</p>
                  <a
                    href={douyinData.url}
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
                douyinData.url
              )}&filename=${encodeURIComponent(douyinData.title || "douyin")}`}
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