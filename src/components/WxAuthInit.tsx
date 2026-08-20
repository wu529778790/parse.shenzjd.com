"use client";

import { useEffect } from "react";
import "wx-auth-sdk/dist/style.css";

// 模块级缓存，避免重复加载
let wxAuthPromise: Promise<typeof import("wx-auth-sdk")> | null = null;

function loadWxAuth() {
  if (!wxAuthPromise) {
    wxAuthPromise = import("wx-auth-sdk");
  }
  return wxAuthPromise;
}

/**
 * 弹出微信公众号关注弹窗（强制关注，不可关闭，阻塞解析主流程）
 * required: true（SDK 默认值）→ 无「×」关闭按钮、遮罩点击不可关闭，
 * 用户必须完成「扫码关注 → 输入验证码」验证通过后才返回 true。
 * @returns true=验证通过, false=失败（此时上层应中断解析）
 */
export async function showWxAuth(): Promise<boolean> {
  try {
    const { WxAuth } = await loadWxAuth();
    // apiBase/wechatName 由 SDK 内硬编码；required 用 SDK 默认 true = 强制关注
    WxAuth.init({ required: true });
    return await WxAuth.requireAuth();
  } catch {
    return false;
  }
}

/**
 * 页面加载时不弹窗，仅预加载 SDK 与样式
 * 实际弹窗在每次发起解析时由 showWxAuth 触发
 */
export default function WxAuthInit() {
  useEffect(() => {
    loadWxAuth().catch(() => {
      // 静默失败，不影响解析
    });
  }, []);

  return null;
}
