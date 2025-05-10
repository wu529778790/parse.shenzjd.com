"use client";
import React from "react";
import { ApiResponse, DouyinData } from "@/types/api";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;

  return (
    <>
      {douyinData.url && (
        <div
          className="w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden flex items-center justify-center"
          style={{ maxWidth: 800 }} // 可根据需要调整最大宽度
        >
          <video
            src={`/api/proxy?url=${encodeURIComponent(douyinData.url)}`}
            controls
            className="w-full h-full object-cover"
            poster={douyinData.cover}
          />
        </div>
      )}
      <a
        href={`/api/proxy?url=${encodeURIComponent(douyinData.url)}`}
        download={`${douyinData.title}.mp4`}
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors mt-2">
        下载视频
      </a>
    </>
  );
}
