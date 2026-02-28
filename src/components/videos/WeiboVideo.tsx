"use client";
import React, { useState, useRef } from "react";
import Image from "next/image";
import { ApiResponse, WeiboData } from "@/types/api";

interface WeiboVideoProps {
  data: ApiResponse;
}

export default function WeiboVideo({ data }: WeiboVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!data.data) {
    return null;
  }

  const weiboData = data.data as WeiboData;

  const handleVideoError = (
    e: React.SyntheticEvent<HTMLVideoElement, Event>
  ) => {
    const video = e.currentTarget;
    setVideoError(`视频加载失败: ${video.error?.message || "网络错误"}`);
    setIsPlaying(false);
  };

  const handleVideoLoad = () => {
    setVideoError(null);
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  return (
    <div className="space-y-5">
      {/* Author Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {weiboData.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] blur-sm opacity-50" />
              <Image
                src={weiboData.avatar}
                alt={weiboData.author}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {weiboData.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {weiboData.title}
              </h2>
            )}
            {weiboData.author && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">@</span>
                <span className="text-sm font-medium text-accent">{weiboData.author}</span>
              </div>
            )}
            {weiboData.time && (
              <p className="text-xs text-muted mt-1">{weiboData.time}</p>
            )}
          </div>

          {/* Weibo Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e6162d] to-[#ff4d6a] flex items-center justify-center">
              <span className="text-white text-xs font-bold">微博</span>
            </div>
          </div>
        </div>
      </div>

      {/* Video Player */}
      {weiboData.url && (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
          <div className="aspect-video w-full">
            <video
              ref={videoRef}
              controls
              poster={weiboData.cover}
              className="w-full h-full object-contain"
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}
              onPlay={handlePlay}
              onPause={handlePause}>
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
          </div>

          {videoError && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center text-white p-6">
                <p className="mb-4 text-sm">{videoError}</p>
                <a
                  href={weiboData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#e6162d] hover:bg-[#c91227] text-white rounded-xl transition-all duration-300">
                  在新窗口打开
                </a>
              </div>
            </div>
          )}

          {isPlaying && !videoError && (
            <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-white font-medium">播放中</span>
            </div>
          )}
        </div>
      )}

      {/* Download Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {weiboData.url && (
          <a
            href={`/api/proxy?url=${encodeURIComponent(
              weiboData.url
            )}&filename=${encodeURIComponent(weiboData.title || "weibo")}&disposition=attachment`}
            download
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#e6162d] to-[#ff4d6a] hover:from-[#c91227] hover:to-[#e6162d] text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#e6162d]/25 hover:-translate-y-0.5">
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
        )}

        {weiboData.url && (
          <a
            href={weiboData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-glass-2 hover:bg-glass-3 text-primary rounded-xl font-medium transition-all duration-300 border border-border-subtle">
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
        )}
      </div>
    </div>
  );
}
