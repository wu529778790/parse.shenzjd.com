"use client";
import { useState } from "react";
import VideoParserForm from "@/components/VideoParserForm";
import {
  BilibiliVideo,
  DouyinVideo,
  KuaishouVideo,
  WeiboVideo,
  XhsVideo,
  QsMusicVideo,
  PipigxVideo,
  PpxiaVideo,
} from "@/components/videos";
import { ApiResponse } from "@/types/api";

export default function Home() {
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleParseResult = (
    data: ApiResponse | null,
    errorMsg: string = ""
  ) => {
    setResult(data);
    setError(errorMsg);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <VideoParserForm
            onResult={handleParseResult}
            setLoading={setLoading}
            loading={loading}
          />

          {error && (
            <div className="max-w-2xl mx-auto p-4 mb-8 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded-lg">
              {error}
            </div>
          )}

          {result && (result.code === 1 || result.code === 200) && (
            <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                {result.platform === "bilibili" && (
                  <BilibiliVideo data={result} />
                )}
                {result.platform === "douyin" && <DouyinVideo data={result} />}
                {result.platform === "kuaishou" && (
                  <KuaishouVideo data={result} />
                )}
                {result.platform === "weibo" && <WeiboVideo data={result} />}
                {result.platform === "xhs" && <XhsVideo data={result} />}
                {result.platform === "qsmusic" && (
                  <QsMusicVideo data={result} />
                )}
                {result.platform === "pipigx" && <PipigxVideo data={result} />}
                {result.platform === "ppxia" && <PpxiaVideo data={result} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
