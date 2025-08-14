// Cloudflare Workers entry for /api/kuaishou
import { parseKuaishou, formatResponse } from "./lib/kuaishouCore.js";

const worker = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/kuaishou") {
      return new Response("Not Found", { status: 404 });
    }
    const target = url.searchParams.get("url");
    if (!target) {
      return Response.json(formatResponse(201, "链接不能为空！"), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    try {
      const data = await parseKuaishou(target);
      if (data) {
        return Response.json(data, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      return Response.json(
        formatResponse(404, "解析失败，可能是链接格式不支持或内容无法访问"),
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    } catch (e) {
      return Response.json(formatResponse(500, "服务器错误", e.message), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};

export default worker;
