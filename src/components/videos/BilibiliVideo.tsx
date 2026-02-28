"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse } from "@/types/api";

interface BilibiliVideoProps {
  data: ApiResponse;
}

export default function BilibiliVideo({ data }: BilibiliVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleVideoError = (
    e: React.SyntheticEvent<HTMLVideoElement, Event>
  ) => {
    const video = e.currentTarget;
    setVideoError(`视频加载失败: ${video.error?.message || "网络错误"}`);
  };

  const handleVideoLoad = () => {
    setVideoError(null);
  };

  const videoItems = data.data && Array.isArray(data.data) ? data.data : [];
  const hasVideo = videoItems.length > 0;

  return (
    <div className="space-y-5">
      {/* Author Info Card */}
      {(data.user?.user_img || data.title) && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-4">
            {data.user?.user_img && (
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00aeec] to-[#4dc9ff] blur-sm opacity-50" />
                <Image
                  src={data.user.user_img}
                  alt={data.user.name}
                  width={56}
                  height={56}
                  className="relative rounded-full border-2 border-glass-3"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {data.title && (
                <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                  {data.title}
                </h2>
              )}
              {data.user?.name && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-secondary">UP主</span>
                  <span className="text-sm font-medium text-accent">{data.user.name}</span>
                </div>
              )}
            </div>

            {/* Bilibili Logo */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00aeec] to-[#4dc9ff] flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Player */}
      {data.imgurl && hasVideo && (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
          <div className="aspect-video w-full">
            <video
              controls
              poster={data.imgurl}
              className="w-full h-full object-contain"
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}>
              <source
                src={`/api/proxy?url=${encodeURIComponent(
                  videoItems[0].video_url
                )}&disposition=inline`}
                type="video/mp4"
              />
              <p className="text-center text-gray-500 p-4">
                您的浏览器不支持视频播放
              </p>
            </video>
          </div>

          {videoError && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center text-white p-6">
                <p className="mb-4 text-sm">{videoError}</p>
                <a
                  href={videoItems[0].video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00aeec] hover:bg-[#0099d4] text-white rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-[#00aeec]/25">
                  在新窗口打开
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Download Options */}
      {hasVideo && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent"
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
            下载选项 ({videoItems.length})
          </h3>

          <div className="space-y-3">
            {videoItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 rounded-xl bg-glass-2 hover:bg-glass-3 transition-colors duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-accent">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">
                      {item.title || `视频 ${index + 1}`}
                    </p>
                    {item.durationFormat && (
                      <p className="text-xs text-muted">{item.durationFormat}</p>
                    )}
                  </div>
                </div>

                <a
                  href={`/api/proxy?url=${encodeURIComponent(
                    item.video_url
                  )}&filename=${encodeURIComponent(
                    (data.title || "bilibili") + `-${index + 1}`
                  )}&disposition=attachment`}
                  download
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00aeec] to-[#4dc9ff] hover:from-[#0099d4] hover:to-[#3db8e8] text-white rounded-lg text-sm font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#00aeec]/25 hover:-translate-y-0.5">
                  <svg
                    className="w-4 h-4"
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
                  下载
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
