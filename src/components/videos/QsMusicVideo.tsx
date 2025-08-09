"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ApiResponse, QsMusicData } from "@/types/api";

interface QsMusicVideoProps {
  data: ApiResponse;
}

export default function QsMusicVideo({ data }: QsMusicVideoProps) {
  const [showLyrics, setShowLyrics] = useState(false);

  if (!data.data) {
    return null;
  }

  const musicData = data.data as QsMusicData;

  return (
    <>
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center gap-4 mb-4">
          {musicData.cover && (
            <Image
              src={musicData.cover}
              alt={musicData.name}
              width={80}
              height={80}
              className="rounded-lg shadow-lg"
              unoptimized
            />
          )}
          <div>
            <h2 className="text-2xl font-bold mb-2">{musicData.name}</h2>
            <p className="text-purple-100 text-sm">{musicData.core}</p>
          </div>
        </div>

        {musicData.url && (
          <div className="mb-4">
            <audio
              controls
              className="w-full"
              style={{
                filter:
                  "sepia(20%) saturate(70%) grayscale(1) contrast(99%) invert(12%)",
                borderRadius: "8px",
              }}>
              <source src={musicData.url} type="audio/mpeg" />
              您的浏览器不支持音频播放
            </audio>
          </div>
        )}

        <div className="flex gap-2">
          {musicData.url && (
            <a
              href={`/api/proxy?url=${encodeURIComponent(
                musicData.url
              )}&filename=${encodeURIComponent(musicData.name || "music")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-purple-50 transition-colors font-medium">
              下载音乐
            </a>
          )}
          {musicData.lyrics && (
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
              {showLyrics ? "隐藏歌词" : "显示歌词"}
            </button>
          )}
        </div>
      </div>

      {showLyrics && musicData.lyrics && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            歌词
          </h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">
            {musicData.lyrics}
          </pre>
        </div>
      )}

      {musicData.copyright && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-4 p-2 bg-gray-100 dark:bg-gray-700 rounded">
          {musicData.copyright}
        </div>
      )}
    </>
  );
}
