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
