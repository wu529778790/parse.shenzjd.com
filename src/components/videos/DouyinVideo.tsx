"use client";
import React, { useState } from "react";
import { ApiResponse, DouyinData } from "@/types/api";

interface DouyinVideoProps {
  data: ApiResponse;
}

export default function DouyinVideo({ data }: DouyinVideoProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!data.data) {
    return null;
  }

  const douyinData = data.data as DouyinData;

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDownloading(true);

    try {
      const response = await fetch(
        `/api/proxy?url=${encodeURIComponent(douyinData.url)}`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${douyinData.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("下载失败:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      {douyinData.url && (
        <div
          className="w-full aspect-video bg-black rounded-lg mb-4 overflow-hidden flex items-center justify-center"
          style={{ maxWidth: 800 }}>
          <video
            src={`/api/proxy?url=${encodeURIComponent(douyinData.url)}`}
            controls
            className="w-full h-full object-cover"
            poster={douyinData.cover}
          />
        </div>
      )}
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors mt-2 disabled:bg-blue-400 disabled:cursor-not-allowed">
        {isDownloading ? "下载中..." : "下载视频"}
      </button>
    </>
  );
}
