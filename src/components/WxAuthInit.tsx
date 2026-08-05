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
 * 弹出微信公众号关注弹窗（可关闭，不阻塞解析主流程）
 * required: false → 弹窗显示「×」关闭按钮，用户可跳过
 * @returns true=验证通过, false=用户关闭或失败
 */
export async function showWxAuth(): Promise<boolean> {
  try {
    const { WxAuth } = await loadWxAuth();
    // apiBase/wechatName 由 SDK 内硬编码，这里只覆盖 required 以启用关闭按钮
    WxAuth.init({ required: false });
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
