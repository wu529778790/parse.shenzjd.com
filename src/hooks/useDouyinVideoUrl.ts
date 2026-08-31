"use client";
import { useEffect, useState } from "react";
import {
  detectDouyinFtypObfuscation,
  isDouyinVideoUrl,
  buildVideoProxyUrl,
} from "@/utils/videoProxy";

/**
 * 抖音视频播放/下载 URL hook。
 *
 * 抖音 CDN 会随机返回 ftyp box size 被混淆的 MP4（首字节 00→01），
 * 导致播放器无法解析。为节省服务器流量，默认用直链播放；仅在检测到
 * 混淆时回退到 /api/video-proxy 代理（代理会修复该混淆）。
 *
 * 返回：
 * - url：最终用于播放/下载的 URL（直链或代理）
 * - checking：是否正在检测（检测期间可显示加载态）
 */
export function useDouyinVideoUrl(url: string): {
  url: string;
  checking: boolean;
} {
  const [resolved, setResolved] = useState<string>(url);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 非抖音视频：直接用原 URL，无需检测
    if (!isDouyinVideoUrl(url)) {
      setResolved(url);
      setChecking(false);
      return;
    }
    setChecking(true);
    detectDouyinFtypObfuscation(url)
      .then((obfuscated) => {
        if (cancelled) return;
        // 检测到混淆 → 回退代理（代理会修复 ftyp）；否则用直链
        setResolved(obfuscated ? buildVideoProxyUrl(url) : url);
      })
      .catch(() => {
        if (!cancelled) setResolved(url);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { url: resolved, checking };
}