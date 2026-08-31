"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { ApiResponse, ParseData } from "@/types/api";
import VideoPosterCard from "./VideoPosterCard";
import { downloadAllImages } from "@/utils/downloadImages";

// 动态加载 mpegts.js（仅客户端，避免 SSR 引入浏览器 API）。
// mpegts.js 是 flv.js 的继任者，专为现代打包工具（webpack 5 / Turbopack）优化，
// 解决了 flv.js 1.6.2 在 Web Worker 中的 ES module 兼容问题。
let mpegtsPromise: Promise<typeof import("mpegts.js").default> | null = null;
function loadMpegts() {
  if (!mpegtsPromise) {
    mpegtsPromise = import("mpegts.js").then((m) => m.default);
  }
  return mpegtsPromise;
}

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [downloading, setDownloading] = useState(false);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as ParseData;
  const isImageType = douyinData.type === "image";
  const images = douyinData.images?.filter(Boolean) || [];

  // 直播：type === "live" 时展示直播信息卡片
  const isLive = douyinData.type === "live";
  if (isLive) {
    return <DouyinLiveCard data={data} />;
  }

  // 合集（mix）：data.videos 存在时展示可点击的合集列表
  const mixVideos = douyinData.videos || [];
  const isMix = mixVideos.length > 0;
  if (isMix) {
    return <DouyinMixList data={data} videos={mixVideos} />;
  }

  const handleDownloadAll = async () => {
    if (downloading || images.length === 0) return;
    setDownloading(true);
    try {
      await downloadAllImages(images, `douyin-${douyinData.author || "图集"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5" style={{ touchAction: 'pan-y' }}>
      {/* 视频：封面 + 中心播放图标（点击新页签打开）+ 下方下载按钮 + 音频下载 */}
      {!isImageType && douyinData.url && (
        <VideoPosterCard
          url={douyinData.url}
          cover={douyinData.cover}
          alt={douyinData.title || "视频封面"}
          accent="orange"
          tall
          showPlay={false}
          downloadText="下载视频"
          audioUrl={douyinData.audioUrl}
        />
      )}

      {/* Image Gallery：单图全宽展示，多图网格（手机 2 列 / 桌面 3 列），点击打开原图 */}
      {isImageType && images.length > 0 && (
        <div className="glass-card p-3">
          {images.length === 1 ? (
            <a
              href={images[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden bg-black">
              <Image
                src={images[0]}
                alt={douyinData.title || "图片"}
                width={864}
                height={1920}
                className="w-full h-auto rounded-xl"
                priority
                unoptimized
              />
            </a>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((imageUrl, index) => (
                <a
                  key={index}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-[3/4] rounded-xl overflow-hidden group block bg-black">
                  <Image
                    src={imageUrl}
                    alt={`${douyinData.title || "图片"} ${index + 1}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </a>
              ))}
            </div>
          )}

          {/* 一键下载全部图片 */}
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-[#ff6600] to-[#ff9933] hover:from-[#e65c00] hover:to-[#ff8800] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                正在下载...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                一键下载全部图片（{images.length} 张）
              </>
            )}
          </button>
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

/** 抖音合集（mix）列表展示 —— PC 端暂不支持，提示用小程序解析 */
function DouyinMixList({
  data,
  videos,
}: {
  data: ApiResponse;
  videos: NonNullable<ParseData["videos"]>;
}) {
  const parsed = data.data as ParseData;

  return (
    <div className="space-y-5" style={{ touchAction: "pan-y" }}>
      {/* 合集信息卡片 */}
      {(parsed?.avatar || parsed?.title) && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-4">
            {parsed?.avatar && (
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ff6600] to-[#ff9933] blur-sm opacity-50" />
                <Image
                  src={parsed.avatar}
                  alt={parsed.author || ""}
                  width={56}
                  height={56}
                  className="relative rounded-full border-2 border-glass-3"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {parsed?.title && (
                <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                  {parsed.title}
                </h2>
              )}
              {parsed?.author && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-secondary">作者</span>
                  <span className="text-sm font-medium text-accent">
                    {parsed.author}
                  </span>
                </div>
              )}
              {parsed?.totalEpisodes ? (
                <p className="text-xs text-muted mt-1">
                  合集 · 共 {parsed.totalEpisodes} 集
                </p>
              ) : (
                <p className="text-xs text-muted mt-1">合集 · 共 {videos.length} 集</p>
              )}
            </div>

            {/* 抖音 Logo */}
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff6600] to-[#ff9933] flex items-center justify-center">
                <span className="text-white font-bold text-sm">抖</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PC 端暂不支持合集播放：提示用小程序解析 */}
      <div className="glass-card p-6 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ff6600] to-[#ff9933] flex items-center justify-center">
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-primary">
            合集视频请用小程序解析
          </p>
          <p className="text-sm text-muted mt-1">
            该链接为抖音合集/系列，共 {videos.length} 集，PC 端暂不支持播放，请使用小程序解析
          </p>
        </div>
      </div>
    </div>
  );
}

/** 抖音直播卡片：展示直播信息 + 内嵌 FLV 播放器（mpegts.js） */
function DouyinLiveCard({ data }: { data: ApiResponse }) {
  const d = data.data as ParseData;
  // 抖音 webcast room status：2=直播中，其他（3/4 等）=已结束/未开播
  const isLiveNow = d.liveStatus === 2;
  const qualities = d.liveQualities || [];
  const shareUrl = d.shareUrl || "";
  // 主清晰度：优先 FLV 流（flv.js 可播），无 FLV 时回退 HLS
  const flvStreams = qualities.filter((q) => q.url.includes(".flv"));
  const defaultFlv = flvStreams[0]?.url || "";
  // 若服务端只返回了 HLS 主链（无 FLV 多清晰度），前端无法内嵌播放
  const canInlinePlay = !!defaultFlv;

  return (
    <div className="space-y-5" style={{ touchAction: "pan-y" }}>
      {/* 直播信息卡片 */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          {d.avatar && (
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ff6600] to-[#ff9933] blur-sm opacity-50" />
              <Image
                src={d.avatar}
                alt={d.author || ""}
                width={56}
                height={56}
                className="relative rounded-full border-2 border-glass-3"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* 直播状态徽标 */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  isLiveNow
                    ? "bg-red-500/15 text-red-500"
                    : "bg-glass-3 text-muted"
                }`}>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLiveNow ? "bg-red-500 animate-pulse" : "bg-muted"
                  }`}
                />
                {isLiveNow ? "直播中" : "未开播"}
              </span>
              {d.liveViewerCount && (
                <span className="text-xs text-muted">
                  {d.liveViewerCount} 人观看
                </span>
              )}
            </div>
            {d.title && (
              <h2 className="text-lg font-semibold text-primary line-clamp-2 mb-1">
                {d.title}
              </h2>
            )}
            {d.author && (
              <p className="text-sm text-muted">{d.author}</p>
            )}
          </div>
        </div>
      </div>

      {/* 内嵌播放器：优先 FLV（mpegts.js），否则显示封面 + HLS 直链 */}
      {canInlinePlay && isLiveNow ? (
        <DouyinLivePlayer
          streams={flvStreams}
          poster={d.cover}
        />
      ) : (
        d.cover && (
          <div className="rounded-2xl overflow-hidden bg-black">
            <Image
              src={d.cover}
              alt={d.title || "直播封面"}
              width={800}
              height={450}
              className="w-full h-auto object-contain"
              unoptimized
            />
          </div>
        )
      )}

      {/* 打开抖音直播间 */}
      {shareUrl && (
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card p-4 inline-flex items-center justify-center gap-2 text-sm text-accent hover:bg-glass-3 transition-all duration-200">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
          打开抖音直播间
        </a>
      )}

      {/* 直播说明 */}
      <div className="glass-card p-4 flex items-start gap-2 text-xs text-muted">
        <svg
          className="w-4 h-4 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <span>
          直播为实时流媒体，当前页面内嵌播放；直播结束后流地址将失效。
        </span>
      </div>
    </div>
  );
}

/**
 * 内嵌 FLV 直播播放器（mpegts.js + MSE）。
 * 支持多清晰度切换；浏览器不支持 MSE 或播放失败时提示用外部播放器。
 */
function DouyinLivePlayer({
  streams,
  poster,
}: {
  streams: { name: string; url: string }[];
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<{ destroy: () => void; unload?: () => void } | null>(null);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<"loading" | "playing" | "error" | "unsupported">("loading");

  const currentStream = streams[current] || streams[0];

  // 清理播放器
  const destroyPlayer = useCallback(() => {
    try {
      playerRef.current?.unload?.();
      playerRef.current?.destroy();
    } catch {
      /* 忽略销毁异常 */
    }
    playerRef.current = null;
  }, []);

  // 初始化 mpegts.js 并播放
  useEffect(() => {
    let cancelled = false;
    let mpegts: typeof import("mpegts.js").default | null = null;

    (async () => {
      try {
        mpegts = await loadMpegts();
        if (cancelled) return;
        if (!mpegts.isSupported()) {
          setStatus("unsupported");
          return;
        }
        const video = videoRef.current;
        if (!video || !currentStream?.url) {
          setStatus("error");
          return;
        }
        setStatus("loading");
        const player = mpegts.createPlayer(
          {
            type: "flv",
            url: currentStream.url,
            isLive: true,
            cors: true,
            // 直播低延迟：关闭缓存、及时清理已播放分片
            enableStashBuffer: false,
            autoCleanupSourceBuffer: true,
          },
          {
            enableWorker: true,
            enableStashBuffer: false,
            autoCleanupSourceBuffer: true,
          }
        );
        playerRef.current = player as unknown as {
          destroy: () => void;
          unload?: () => void;
        };
        player.attachMediaElement(video);
        player.load();
        player
          .play()
          .then(() => {
            if (!cancelled) setStatus("playing");
          })
          .catch(() => {
            if (!cancelled) setStatus("error");
          });
        player.on(mpegts.Events.ERROR, () => {
          if (!cancelled) setStatus("error");
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [currentStream?.url, destroyPlayer]);

  // 清晰度切换时重新播放
  const handleSwitch = (index: number) => {
    if (index === current) return;
    destroyPlayer();
    setCurrent(index);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden bg-black relative aspect-video">
        <video
          ref={videoRef}
          controls
          playsInline
          poster={poster}
          className="w-full h-full object-contain"
        />

        {/* 加载 / 错误 / 不支持遮罩 */}
        {status !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center p-4">
            {status === "loading" && (
              <>
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <p className="text-sm text-white/80">正在连接直播流…</p>
              </>
            )}
            {status === "error" && (
              <>
                <p className="text-sm text-white/80">直播流播放失败</p>
                <p className="text-xs text-white/50">
                  可能是网络受限或直播已结束，请刷新重试或打开抖音直播间
                </p>
              </>
            )}
            {status === "unsupported" && (
              <>
                <p className="text-sm text-white/80">当前浏览器不支持内嵌播放</p>
                <p className="text-xs text-white/50">
                  请使用 Chrome / Edge 等现代浏览器，或打开抖音直播间
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 清晰度切换 */}
      {streams.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {streams.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => handleSwitch(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                i === current
                  ? "bg-[#ff6600]/15 border-[#ff6600]/50 text-[#ff6600]"
                  : "bg-glass-2 hover:bg-glass-3 text-primary border-border-subtle"
              }`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}