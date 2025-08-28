"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, VideoItem } from "@/types/api";

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
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {data.user?.user_img && (
          <Image
            src={data.user.user_img}
            alt={data.user.name}
            width={48}
            height={48}
            className="rounded-full"
          />
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {data.title}
          </h2>
          {data.user?.name && (
            <p className="text-gray-600 dark:text-gray-300 text-left">
              {data.user.name}
            </p>
          )}
        </div>
      </div>
      {data.imgurl &&
        data.data &&
        Array.isArray(data.data) &&
        data.data.length > 0 && (
          <div className="relative w-full rounded-lg mb-6 overflow-hidden">
            <video
              controls
              poster={data.imgurl}
              className="w-full h-auto bg-black rounded-lg"
              preload="none"
              playsInline
              crossOrigin="anonymous"
              onError={handleVideoError}
              onLoadedData={handleVideoLoad}>
              <source
                src={`/api/proxy?url=${encodeURIComponent(
                  (data.data as VideoItem[])[0].video_url
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
                    href={(data.data as VideoItem[])[0].video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                    在新窗口打开
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      {data.data && Array.isArray(data.data) && data.data.length > 0 && (
        <div className="space-y-4">
          {(data.data as VideoItem[]).map((item, index) => (
            <div
              key={index}
              className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <a
                href={`/api/proxy?url=${encodeURIComponent(
                  item.video_url
                )}&filename=${encodeURIComponent(
                  (data.title || "bilibili") + `-${index + 1}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                下载视频
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
