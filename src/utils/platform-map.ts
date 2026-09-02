import type { VideoPlatformKey } from "@/config/video-platforms";

/**
 * 后端平台 key → 前端平台 key 映射。
 *
 * 统一接口 /api/parse 返回的 `platform` 字段是后端 `lib/platforms.ts` 的
 * PLATFORM_INFO key（如小红书是 `redbook`、皮皮虾是 `pipixia`），而前端
 * VIDEO_PLATFORMS 的 key 命名不同（小红书是 `xhs`、皮皮虾是 `ppxia`）。
 * 前端消费统一接口结果时，需先把后端 key 映射回前端 key，才能正确渲染。
 *
 * 未列出的 key 两端一致，直接透传。
 */
const BACKEND_TO_FRONTEND: Record<string, VideoPlatformKey> = {
  redbook: "xhs", // 小红书
  pipixia: "ppxia", // 皮皮虾
};

/** 后端平台 key → 前端平台 key；未知 key 原样返回（类型上按前端 key 处理） */
export function toFrontendPlatform(
  backendKey: string | undefined
): VideoPlatformKey | undefined {
  if (!backendKey) return undefined;
  return BACKEND_TO_FRONTEND[backendKey] ?? (backendKey as VideoPlatformKey);
}