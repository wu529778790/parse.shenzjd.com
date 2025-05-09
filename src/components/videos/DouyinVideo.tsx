"use client";
import Image from "next/image";
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
        {douyinData.avatar && (
          <Image
            src={douyinData.avatar}
            alt={douyinData.author}
            width={48}
            height={48}
            className="rounded-full"
          />
        )}
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
      {douyinData.cover && (
        <Image
          src={douyinData.cover}
          alt={douyinData.title || ""}
          width={640}
          height={360}
          className="rounded-lg mb-6"
        />
      )}
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
        <a
          href={douyinData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          打开原视频
        </a>
      )}
    </>
  );
}
