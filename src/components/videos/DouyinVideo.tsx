"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, DouyinData } from "@/types/api";

// 长视频阈值：超过该时长（毫秒）展示「服务器扛不住」话术，但所有视频统一走直链
const LONG_VIDEO_DURATION_MS = 3 * 60 * 1000; // 3 分钟

// 封面/头像等图片资源仍走代理（图片小、流量可控），视频一律直链不代理
function proxyUrl(url: string | undefined): string {
  if (!url) return url || "";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (
      hostname.includes("douyinpic") ||
      hostname.includes("iesdouyin") ||
      hostname.includes("xhscdn") ||
      hostname.includes("xhsimgs") ||
      hostname.includes("redbook")
    ) {
      const referer = hostname.includes("xhscdn") || hostname.includes("xhsimgs") || hostname.includes("redbook")
        ? "https://www.xiaohongshu.com/"
        : "https://www.douyin.com/";
      return `/api/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
    }
  } catch {}
  return url;
}

// 格式化时长：ms -> "3分25秒" / "34分钟"
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
}

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [imageLoading, setImageLoading] = useState(true);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;
  const isImageType = douyinData.type === "image";
  const isLongVideo =
    !isImageType &&
    !!douyinData.url &&
    (douyinData.duration || 0) > LONG_VIDEO_DURATION_MS;

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Video: 统一走直链新窗口，不代理播放/下载 */}
      {!isImageType && douyinData.url && (
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl">
          <div className="relative">
            <div className="aspect-[9/16] sm:aspect-video w-full relative">
              <Image
                src={proxyUrl(douyinData.cover)}
                alt={douyinData.title || "视频封面"}
                fill
                className="object-contain"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-6 gap-4">
                <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  {isLongVideo ? (
                    <>
                      <p className="text-base font-medium mb-1">服务器扛不住了 🙏</p>
                      <p className="text-sm text-gray-300">
                        这个视频太长了（约 {formatDuration(douyinData.duration || 0)}），
                        走咱家服务器太费流量，大家体谅一下～
                      </p>
                    </>
                  ) : (
                    <p className="text-base font-medium mb-1">视频已就绪 🎬</p>
                  )}
                </div>
                <a
                  href={douyinData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  打开新链接
                </a>
                <p className="text-xs text-gray-400">
                  打开后点击视频右下角「⋯」三个点，就能下载
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Gallery */}
      {isImageType && douyinData.images && douyinData.images.length > 0 && (
        <div className="glass-card p-3">
          {douyinData.images.length === 1 ? (
            <div className="relative rounded-xl overflow-hidden">
              {imageLoading && (
                <div className="absolute inset-0 bg-glass-2 animate-pulse" />
              )}
              <Image
                src={proxyUrl(douyinData.images[0])}
                alt={douyinData.title || "图片"}
                width={864}
                height={1920}
                className="w-full h-auto rounded-xl"
                priority
                unoptimized
                onLoad={() => setImageLoading(false)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {douyinData.images.map((imageUrl, index) => (
                <div
                  key={index}
                  className="relative rounded-xl overflow-hidden group">
                  <Image
                    src={proxyUrl(imageUrl)}
                    alt={`${douyinData.title || "图片"} ${index + 1}`}
                    width={864}
                    height={1920}
                    className="w-full h-auto rounded-xl transition-transform duration-500 group-hover:scale-[1.02]"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image type hint */}
      {isImageType && (
        <div className="glass-card p-3 flex items-center gap-2 text-xs text-muted">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>当前显示为静态图，动图/实况图的动画效果暂不支持</span>
        </div>
      )}

      {/* Video Info */}
      {douyinData.title && (
        <div className="glass-card p-4">
          <p className="text-sm text-muted line-clamp-2">{douyinData.title}</p>
        </div>
      )}

      {/* Download Button: 一律打开直链新窗口，不经过服务器代理 */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!isImageType && douyinData.url && (
          <a
            href={douyinData.url}
            target="_blank"
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
            打开新链接下载
          </a>
        )}

        <a
          href={douyinData.url || douyinData.images?.[0]}
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
