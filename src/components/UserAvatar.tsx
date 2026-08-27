"use client";

import { useEffect } from "react";
import type { UserAvatarOptions } from "@wu529778790/user-avatar";
import "@wu529778790/user-avatar/style.css";

/**
 * 右上角用户头像账号组件（@wu529778790/user-avatar）
 * - 未登录：默认人形头像，点击 → 微信订阅号认证登录窗
 * - 已登录：真实头像（微信 > GitHub > 昵称首字母），点击 → 下拉菜单（设置 / 退出登录）
 * - 设置弹窗：GitHub 绑定 / 解绑、修改昵称、openid 展示
 *
 * 关键点：必须 fixed:true 并挂到 document.body。
 * 组件内部设置弹窗用 position:fixed，若把 root 嵌进 Header 内，
 * 会被 Header 的 backdrop-filter 创建的 containing block 困住，
 * 导致弹窗跑到顶部而非视口居中。挂到 body 后 containing block = 视口，弹窗正常居中。
 */
export default function UserAvatar() {
  useEffect(() => {
    let instance: {
      mount: (target?: HTMLElement) => unknown;
      unmount: () => void;
    } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [{ default: UserAvatarCtor }, { WxAuth }] = await Promise.all([
          import("@wu529778790/user-avatar"),
          import("wx-auth-sdk"),
        ]);
        if (cancelled) return;
        // 仅静默校验登录态（silent:true 绝不自动弹窗；required:false 弹窗可关闭）
        WxAuth.init({ silent: true, required: false });
        instance = new UserAvatarCtor({
          // 运行时 SDK 具备 clearToken（类型未声明），此处做兼容断言
          sdk: WxAuth as unknown as UserAvatarOptions["sdk"],
          fixed: true,
          // 与 header h-14(56px) 垂直居中 38px 头像：top ≈ 9px = 0.55rem
          offset: "0.55rem 0.75rem",
          zIndex: 12000,
          size: "2.4rem",
          theme: { accent: "#6366f1" },
        });
        // 不传 target：组件把 root 追加到 container（默认 document.body），
        // 脱离 Header 的 backdrop-filter 上下文
        instance.mount();
      } catch {
        // 组件加载失败静默处理，不影响页面主流程
      }
    })();

    return () => {
      cancelled = true;
      instance?.unmount();
    };
  }, []);

  // 头像由组件自身固定定位渲染，不在 Header flex 流程中占位
  return null;
}