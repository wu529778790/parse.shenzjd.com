// Cloudflare Workers entry: serve Next exported static assets + API routes

import { GET as GET_douyin } from "./app/api/douyin/route.js";
import { GET as GET_bilibili } from "./app/api/bilibili/route.js";
import { GET as GET_kuaishou } from "./app/api/kuaishou/route.js";
import { GET as GET_weibo } from "./app/api/weibo/route.js";
import { GET as GET_xhs } from "./app/api/xhs/route.js";
import { GET as GET_pipigx } from "./app/api/pipigx/route.js";
import { GET as GET_ppxia } from "./app/api/ppxia/route.js";
import { GET as GET_qsmusic } from "./app/api/qsmusic/route.js";

const apiHandlers = {
  "/api/douyin": GET_douyin,
  "/api/bilibili": GET_bilibili,
  "/api/kuaishou": GET_kuaishou,
  "/api/weibo": GET_weibo,
  "/api/xhs": GET_xhs,
  "/api/pipigx": GET_pipigx,
  "/api/ppxia": GET_ppxia,
  "/api/qsmusic": GET_qsmusic,
};

const worker = {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle API routes first
    if (url.pathname.startsWith("/api/")) {
      const basePath = Object.keys(apiHandlers).find((p) => url.pathname === p);
      if (!basePath) return new Response("Not Found", { status: 404 });
      const handler = apiHandlers[basePath];
      return handler(request);
    }

    // Serve static assets from Next export output (out/)
    const path = url.pathname;
    const tryPaths = [];
    if (path === "/") {
      tryPaths.push("/index.html");
    } else {
      tryPaths.push(path);
      if (path.endsWith("/")) {
        tryPaths.push(`${path}index.html`);
      } else if (!path.includes(".")) {
        tryPaths.push(`${path}.html`);
        tryPaths.push(`${path}/index.html`);
      }
      tryPaths.push("/index.html");
    }

    for (const p of tryPaths) {
      try {
        const resp = await fetch(new URL(`../out${p}`, import.meta.url));
        if (resp.ok) return resp;
      } catch {}
    }
    return new Response("Not Found", { status: 404 });
  },
};

export default worker;
