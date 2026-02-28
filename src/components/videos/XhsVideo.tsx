"use client";
import React, { useState, useRef } from "react";
import Image from "next/image";
import { ApiResponse, XhsData } from "@/types/api";

interface XhsVideoProps {
  data: ApiResponse;
}

export default function XhsVideo({ data }: XhsVideoProps) {
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!data.data) {
    return null;
  }

  const xhsData = data.data as XhsData;

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

  const isImageType = xhsData.type === "image";

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Author Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {xhsData.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ff2442] to-[#ff5c7c] blur-sm opacity-50" />
              <Image
                src={xhsData.avatar}
                alt={xhsData.author}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {xhsData.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {xhsData.title}
              </h2>
            )}
            {xhsData.author && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">作者</span>
                <span className="text-sm font-medium text-accent">{xhsData.author}</span>
              </div>
            )}
          </div>

          {/* XHS Logo */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff2442] to-[#ff5c7c] flex items-center justify-center">
              <span className="text-white text-xs font-bold">小红书</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {xhsData.desc && (
        <div className="glass-card p-4">
          <p className="text-sm text-muted leading-relaxed">{xhsData.desc}</p>
        </div>
      )}

      {/* Video Content */}
      {!isImageType && xhsData.url && (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
          <div className="aspect-[9/16] sm:aspect-video w-full">
            <video
              ref={videoRef}
              controls
              poster={xhsData.cover}
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
                  xhsData.url
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
                  href={xhsData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff2442] hover:bg-[#e61f3a] text-white rounded-xl transition-all duration-300">
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

      {/* Image Gallery */}
      {isImageType && xhsData.images && xhsData.images.length > 0 && (
        <div className="glass-card p-3">
          {xhsData.images.length === 1 ? (
            <div className="relative aspect-square rounded-xl overflow-hidden">
              {imageLoading && (
                <div className="absolute inset-0 bg-glass-2 animate-pulse" />
              )}
              <Image
                src={xhsData.images[0]}
                alt={xhsData.title || "图片"}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                className="object-cover transition-transform duration-500 hover:scale-105"
                priority
                unoptimized
                onLoad={() => setImageLoading(false)}
              />
            </div>
          ) : (
            <div
              className={`grid gap-2 ${
                xhsData.images.length === 2
                  ? "grid-cols-2"
                  : xhsData.images.length === 3
                  ? "grid-cols-3"
                  : xhsData.images.length === 4
                  ? "grid-cols-2"
                  : "grid-cols-3"
              }`}>
              {xhsData.images.map((imageUrl, index) => (
                <div
                  key={index}
                  className={`relative aspect-square rounded-xl overflow-hidden group ${
                    xhsData.images!.length === 4 && index >= 2
                      ? "col-span-1"
                      : ""
                  }`}>
                  <Image
                    src={imageUrl}
                    alt={`${xhsData.title || "图片"} ${index + 1}`}
                    fill
                    sizes="(max-width: 800px) 50vw, 400px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Download Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!isImageType && xhsData.url && (
          <a
            href={`/api/proxy?url=${encodeURIComponent(
              xhsData.url
            )}&filename=${encodeURIComponent(xhsData.title || "xhs")}&disposition=attachment`}
            download
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff2442] to-[#ff5c7c] hover:from-[#e61f3a] hover:to-[#ff4d6a] text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-[#ff2442]/25 hover:-translate-y-0.5">
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
            {isImageType ? "下载图片" : "下载视频"}
          </a>
        )}

        {(xhsData.url || xhsData.images) && (
          <a
            href={xhsData.url || xhsData.images?.[0]}
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
