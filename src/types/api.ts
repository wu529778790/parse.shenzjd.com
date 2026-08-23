import type { VideoPlatformKey } from "@/config/video-platforms";

/** 多分P / 多清晰度视频项（bilibili 等） */
export interface ParsedVideoItem {
  title?: string;
  url: string;
  /** 时长（秒） */
  duration?: number;
  /** 格式化时长，如 "00:02:59" */
  durationFormat?: string;
  /** 清晰度标签，如 "高清 1080P+" */
  accept?: string[];
}

/**
 * 统一媒体解析数据结构 —— 所有平台解析成功后 data 的契约。
 *
 * 由服务端 `normalize-result` 归一化产出；前端只消费本结构，
 * 平台特有字段（音乐/统计）作为可选扩展保留在同一对象内。
 */
export interface ParseData {
  // —— 内容信息 ——
  title?: string;
  desc?: string;
  /** 内容类型：video / image / music */
  type?: "video" | "image" | "music";
  /** 视频时长（毫秒，抖音等平台） */
  duration?: number;

  // —— 作者信息 ——
  author?: string;
  authorId?: string;
  avatar?: string;

  // —— 媒体 ——
  /** 封面图 */
  cover?: string;
  /** 主媒体直链（视频 / 音乐 / 单图） */
  url?: string;
  /** 音频直链（背景音乐 / 原声），前端据此提供「下载音频」 */
  audioUrl?: string;
  /** 图集 */
  images?: string[];
  /** 多分P / 多清晰度列表（bilibili） */
  videos?: ParsedVideoItem[];

  // —— 音乐扩展（汽水音乐等） ——
  name?: string;
  lyrics?: string;
  core?: string;
  copyright?: string;

  // —— 平台特有统计（保留，抖音等） ——
  like?: number;
  time?: number | string;
  uid?: string;
  music?: { author: string; avatar: string };
}

export interface ApiResponse {
  code: number;
  msg: string;
  platform?: VideoPlatformKey;
  data?: ParseData;
}
