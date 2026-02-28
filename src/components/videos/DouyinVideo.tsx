"use client";
import React, { useState, useRef } from "react";
import { ApiResponse, DouyinData } from "@/types/api";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(douyinData.url)}&disposition=inline`;

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    setVideoError(`视频加载失败: ${video.error?.message || "网络错误"}`);
    setIsPlaying(false);
  };

  const handleVideoLoad = () => {
    setVideoError(null);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  return (
    <div className="space-y-5">
      {/* Video Container */}
      <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
        <div className="aspect-[9/16] sm:aspect-video w-full">
          <video
            ref={videoRef}
            controls
            poster={douyinData.cover}
            className="w-full h-full object-contain"
            preload="metadata"
            playsInline
            crossOrigin="anonymous"
            onError={handleVideoError}
            onLoadedData={handleVideoLoad}
            onPlay={handlePlay}
            onPause={handlePause}>
            <source src={proxyUrl} type="video/mp4" />
            <p className="text-center text-gray-500 p-4">
              您的浏览器不支持视频播放
            </p>
          </video>
        </div>

        {/* Error Overlay */}
        {videoError && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center text-white p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="mb-4 text-sm">{videoError}</p>
              <a
                href={douyinData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-green-500/25 hover:-translate-y-0.5">
                <svg
                  className="w-4 h-4"
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
                在新窗口打开
              </a>
            </div>
          </div>
        )}

        {/* Playing Indicator */}
        {isPlaying && !videoError && (
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-white font-medium">播放中</span>
          </div>
        )}
      </div>

      {/* Video Info */}
      {douyinData.title && (
        <div className="glass-card p-4">
          <p className="text-sm text-muted line-clamp-2">{douyinData.title}</p>
        </div>
      )}

      {/* Download Button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={`/api/proxy?url=${encodeURIComponent(
            douyinData.url
          )}&filename=${encodeURIComponent(douyinData.title || "douyin")}&disposition=attachment`}
          download
          rel="noopener noreferrer"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5">
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

        <a
          href={douyinData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-glass-2 hover:bg-glass-3 text-primary rounded-xl font-medium transition-all duration-300 border border-border-subtle hover:border-accent/30">
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
      </div>
    </div>
  );
}
