// @ts-nocheck
/**
 * bilibili-fetch 中继协议的单元测试。
 *
 * 覆盖 2026-10-30 的中继切换：
 * - 默认走自建 Docker 中继的「直通协议」（?target= + 原样透传），
 *   它替换掉旧 SCF 信封协议，原因是信封把响应体 base64 塞进 JSON 后
 *   在 ~750KB 处被网关截断（线上 B站大响应稳定解析失败）。
 * - BILIBILI_RELAY_PROTOCOL=scf 时仍走旧协议（回滚路径，不能坏）。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { biliFetch } from "@/lib/bilibili-fetch";

let server: http.Server;
let baseUrl = "";
let seen = null;
let handler = null;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    seen = { method: req.method, url: req.url, headers: req.headers, body: await readBody(req) };
    await handler(seen, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const original = {
  url: process.env.BILIBILI_RELAY_URL,
  token: process.env.BILIBILI_RELAY_TOKEN,
  protocol: process.env.BILIBILI_RELAY_PROTOCOL,
};

beforeEach(() => {
  seen = null;
  process.env.BILIBILI_RELAY_URL = baseUrl;
  process.env.BILIBILI_RELAY_TOKEN = "test-token";
  delete process.env.BILIBILI_RELAY_PROTOCOL;
});

afterEach(() => {
  for (const [key, envName] of [
    [original.url, "BILIBILI_RELAY_URL"],
    [original.token, "BILIBILI_RELAY_TOKEN"],
    [original.protocol, "BILIBILI_RELAY_PROTOCOL"],
  ]) {
    if (key === undefined) delete process.env[envName];
    else process.env[envName] = key;
  }
});

describe("bilibili 中继：直通协议（自建 Docker 中继）", () => {
  it("把目标地址放进 ?target=，带鉴权头，正文原样返回", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { bvid: "BV1xx" } }));
    };

    const target = "https://api.bilibili.com/x/web-interface/view?bvid=BV1xx";
    const response = await biliFetch(target, { headers: { "User-Agent": "ua-test" } });

    expect(seen.url).toBe(`/?target=${encodeURIComponent(target)}`);
    expect(seen.headers["x-relay-token"]).toBe("test-token");
    // 调用方的业务头必须透传给中继（中继按黑名单剔逐跳头）
    expect(seen.headers["user-agent"]).toBe("ua-test");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 0, data: { bvid: "BV1xx" } });
  });

  it("b23.tv 短链：最终地址取 x-relay-final-url（中继侧跟随重定向）", async () => {
    const finalUrl = "https://www.bilibili.com/bangumi/play/ep4567049";
    handler = (_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "x-relay-final-url": encodeURIComponent(finalUrl),
      });
      res.end("{}");
    };

    const response = await biliFetch("https://b23.tv/ep4567049");
    expect(response.url).toBe(finalUrl);
  });

  it("没有 x-relay-final-url 时退回中继地址，不抛错", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    };

    const response = await biliFetch("https://api.bilibili.com/x/web-interface/nav");
    expect(response.url).toBe(`${baseUrl}/?target=${encodeURIComponent("https://api.bilibili.com/x/web-interface/nav")}`);
  });

  it("近 1MB 的大响应完整透传（旧信封协议在这里被截断）", async () => {
    const payload = JSON.stringify({ code: 0, data: { desc: "x".repeat(900000) } });
    expect(payload.length).toBeGreaterThan(800 * 1024);
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(payload);
    };

    const response = await biliFetch("https://api.bilibili.com/x/web-interface/view?bvid=BV1big");
    const text = await response.text();
    expect(text.length).toBe(payload.length);
    expect(JSON.parse(text).data.desc.length).toBe(900000);
  });

  it("中继自身故障（x-relay-error）抛出可归因错误，不伪装成 B站响应", async () => {
    handler = (_req, res) => {
      res.writeHead(504, { "content-type": "application/json", "x-relay-error": "timeout" });
      res.end(JSON.stringify({ code: -1, relay: true, message: "relay timeout" }));
    };

    await expect(biliFetch("https://api.bilibili.com/x/web-interface/view?bvid=BV1xx")).rejects.toThrow(
      /中继故障\(timeout\)/
    );
  });
});

describe("bilibili 中继：SCF 信封协议（回滚路径）", () => {
  it("BILIBILI_RELAY_PROTOCOL=scf 时仍走旧信封协议", async () => {
    process.env.BILIBILI_RELAY_PROTOCOL = "scf";
    const raw = JSON.stringify({ code: 0, data: { bvid: "BV1scf" } });
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: 200,
          url: "https://api.bilibili.com/x/web-interface/view?bvid=BV1scf",
          headers: { "content-type": "application/json" },
          setCookie: [],
          body: Buffer.from(raw).toString("base64"),
        })
      );
    };

    const target = "https://api.bilibili.com/x/web-interface/view?bvid=BV1scf";
    const response = await biliFetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    // 旧协议是 POST 到中继根路径，目标地址在 JSON 信封里
    expect(seen.url).toBe("/");
    expect(seen.headers["x-relay-token"]).toBe("test-token");
    expect(JSON.parse(seen.body)).toMatchObject({
      url: target,
      method: "POST",
      body: Buffer.from("{}").toString("base64"),
    });
    expect(response.url).toBe(target);
    expect(await response.json()).toEqual({ code: 0, data: { bvid: "BV1scf" } });
  });

  it("SCF 信封返回 error 字段时抛出中继转发失败", async () => {
    process.env.BILIBILI_RELAY_PROTOCOL = "scf";
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "The operation was aborted due to timeout" }));
    };

    await expect(biliFetch("https://api.bilibili.com/x/web-interface/nav")).rejects.toThrow(
      /中继转发失败/
    );
  });
});
