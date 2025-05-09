"use client";
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
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {douyinData.title}
          </h2>
          {douyinData.author && (
            <p className="text-gray-600 dark:text-gray-300">
              {douyinData.author}
            </p>
          )}
        </div>
      </div>
      {douyinData.music && (
        <p className="text-gray-600 dark:text-gray-300 mb-2">
          配乐：
          {douyinData.music.author ? `${douyinData.music.author} - ` : ""}
          {douyinData.music.title || ""}
        </p>
      )}
      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300 mb-4">
        <span>点赞：{douyinData.like}</span>
        <span>UID：{douyinData.uid}</span>
      </div>
      {douyinData.url && (
        <video
          src={`/api/proxy?url=${encodeURIComponent(douyinData.url)}`}
          controls
          className="w-full rounded-lg mb-4"
          poster={douyinData.cover}
        />
      )}
    </>
  );
}
