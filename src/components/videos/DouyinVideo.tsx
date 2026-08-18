"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, DouyinData } from "@/types/api";

// 长视频阈值：超过该时长（毫秒）展示「服务器扛不住」话术，但所有视频统一走直链
const LONG_VIDEO_DURATION_MS = 3 * 60 * 1000; // 3 分钟

// 封面/头像/图片一律直链（不再走 /api/proxy）
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
  const [copied, setCopied] = useState(false);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;
  const isImageType = douyinData.type === "image";
  const isLongVideo =
    !isImageType &&
    !!douyinData.url &&
    (douyinData.duration || 0) > LONG_VIDEO_DURATION_MS;

  const handleCopy = async () => {
    if (!douyinData.url) return;
    try {
      await navigator.clipboard.writeText(douyinData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：旧浏览器 / 非安全上下文
      try {
        const textarea = document.createElement("textarea");
        textarea.value = douyinData.url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // 复制失败时提示用户手动复制
        window.prompt("请手动复制视频链接：", douyinData.url);
      }
    }
  };

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* Video: 统一走直链新窗口，不代理播放/下载 */}
      {!isImageType && douyinData.url && (
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl">
          <div className="relative">
            <div className="aspect-[9/16] sm:aspect-video w-full relative">
              <Image
                src={douyinData.cover}
                alt={douyinData.title || "视频封面"}
                fill
                className="object-contain"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-6 gap-3">
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
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                  <button
                    onClick={handleCopy}
                    className={`group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:-translate-y-0.5 ${
                      copied
                        ? "bg-green-600 hover:bg-green-600 text-white"
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    }`}>
                    <svg
                      className="w-5 h-5 transition-transform group-hover:scale-110"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}>
                      {copied ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
                        </>
                      )}
                    </svg>
                    {copied ? "已复制 ✓" : "复制链接"}
                  </button>
                  <a
                    href={douyinData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    新页面打开链接
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 三步引导：打开新链接 → 右下角三个点 → 下载 */}
      {!isImageType && douyinData.url && (
        <div className="glass-card p-4">
          <p className="text-sm font-medium text-primary mb-3">下载指引</p>
          <ol className="space-y-2.5 text-sm text-muted">
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 text-xs font-medium flex items-center justify-center mt-0.5">1</span>
              <span>打开新链接</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 text-xs font-medium flex items-center justify-center mt-0.5">2</span>
              <span>点击视频右下角「⋯」三个点</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 text-xs font-medium flex items-center justify-center mt-0.5">3</span>
              <span>点击「下载更清晰」</span>
            </li>
          </ol>
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
                src={douyinData.images[0]}
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
                    src={imageUrl}
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
    </div>
  );
}
