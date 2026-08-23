import type { ParseData, ParsedVideoItem } from "@/types/api";

/**
 * 统一响应模型归一化 —— 在 API 出口层把各平台解析器的原始返回
 * 归一化为统一的 `{ code: 200, msg, platform?, data: ParseData }` 契约。
 *
 * 设计原则：
 * - 解析器（脆弱层）保持原样，不在其中改动字段；
 * - 本模块只做「字段名映射 + bilibili 特例 + 成功 code 统一」；
 * - 保留原始字段（向后兼容，外部消费者不受影响），新增统一字段供前端消费。
 */

// 统一字段 ← 各平台原始字段名（按优先级顺序取第一个非空值）
const FIELD_SOURCES: Record<string, string[]> = {
  title: ["title", "caption", "name", "videoTitle"],
  desc: ["desc", "description"],
  author: ["author", "authorName", "actorNick"],
  authorId: ["authorId", "authorID", "uid"],
  cover: ["cover", "coverUrl", "imgurl", "poster", "videoCover", "thumbnail"],
  url: ["url", "photoUrl", "video", "videoUrl", "playUrl", "mp4Url"],
};

function firstNonEmpty(
  obj: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** 非空判断：null / undefined / 空字符串均视为「无值」 */
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * 归一化单个解析结果。
 * - 非成功响应（code 非 200/1）原样返回；
 * - 成功 code 统一为 200（bilibili 历史用 1）；
 * - bilibili（data 为数组）走特例，把顶层字段与分P列表归入 data。
 */
export function normalizeResult<T = unknown>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const result = input as Record<string, unknown>;

  const code = result.code;
  if (code !== 200 && code !== 1) return input;

  // bilibili 特例：data 为分P数组，title/desc/imgurl/user 散落在顶层
  if (Array.isArray(result.data)) {
    return normalizeBilibili(result) as T;
  }

  const raw = result.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...result, code: 200 } as T;
  }

  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };

  for (const [target, sources] of Object.entries(FIELD_SOURCES)) {
    if (hasValue(out[target])) continue; // 已存在统一字段则保留
    const value = firstNonEmpty(src, sources);
    if (value !== undefined) out[target] = value;
  }

  return { ...result, code: 200, data: out } as T;
}

/** bilibili：分P数组 + 顶层字段 → 统一 ParseData */
function normalizeBilibili(
  result: Record<string, unknown>
): { code: number; msg: unknown; platform: unknown; data: ParseData } {
  const items = Array.isArray(result.data)
    ? (result.data as Record<string, unknown>[])
    : [];

  const videos: ParsedVideoItem[] = items
    .map((item) => ({
      title: hasValue(item.title) ? (item.title as string) : undefined,
      url: hasValue(item.video_url) ? (item.video_url as string) : "",
      duration: hasValue(item.duration) ? Number(item.duration) : undefined,
      durationFormat: hasValue(item.durationFormat)
        ? (item.durationFormat as string)
        : undefined,
      accept: Array.isArray(item.accept) ? item.accept : undefined,
    }))
    .filter((v) => v.url);

  const user = (result.user ?? {}) as Record<string, unknown>;

  return {
    code: 200,
    msg: result.msg,
    platform: result.platform,
    data: {
      title: hasValue(result.title) ? (result.title as string) : undefined,
      desc: hasValue(result.desc) ? (result.desc as string) : undefined,
      cover: hasValue(result.imgurl) ? (result.imgurl as string) : undefined,
      author: hasValue(user.name) ? (user.name as string) : undefined,
      avatar: hasValue(user.user_img) ? (user.user_img as string) : undefined,
      videos,
    },
  };
}
