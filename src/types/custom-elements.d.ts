import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * 自定义 Web Component 元素类型声明
 * 让 TypeScript 识别 JSX 中使用的自定义元素（如 <site-navbar />）
 * React 19 使用 React.JSX 命名空间，需在此处扩展
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "site-navbar": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};