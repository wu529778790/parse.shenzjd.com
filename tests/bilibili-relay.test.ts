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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { biliFetch, resolveRelayProtocol } from "@/lib/bilibili-fetch";

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

  it("中继自己的拒绝（403 token 不符 / 400 bad target）也抛错，不冒充 B站正文", async () => {
    handler = (_req, res) => {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("forbidden");
    };
    await expect(biliFetch("https://api.bilibili.com/x/web-interface/view?bvid=BV1xx")).rejects.toThrow(
      /中继 HTTP 403: forbidden/
    );

    handler = (_req, res) => {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad target");
    };
    await expect(biliFetch("https://b23.tv/ep4567049")).rejects.toThrow(/中继 HTTP 400: bad target/);
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

describe("bilibili 中继：协议按地址自动判断（迁移期防呆）", () => {
  // 迁移是「换代码」和「换 .env 地址」两件事，任何一件单独生效都不该让 B 站全挂：
  // 直通协议去打 SCF 信封中继时，对方回 {"error":"invalid body: ..."} 且 HTTP 200，
  // 表现为 b23.tv 短链「好像不是视频链接」、普通链接「解析失败！」（2026-11-01 线上）。
  it("未配置协议时，腾讯云函数地址自动走 SCF 信封协议", () => {
    delete process.env.BILIBILI_RELAY_PROTOCOL;
    expect(
      resolveRelayProtocol("https://1256194003-1pp3pgcc9p.ap-guangzhou.tencentscf.com")
    ).toBe("scf");
  });

  it("未配置协议时，自建中继地址自动走直通协议", () => {
    delete process.env.BILIBILI_RELAY_PROTOCOL;
    expect(resolveRelayProtocol("http://123.207.66.24:9443")).toBe("target");
    expect(resolveRelayProtocol("https://relay.example.com")).toBe("target");
  });

  it("显式配置优先于自动判断（两个方向都生效）", () => {
    process.env.BILIBILI_RELAY_PROTOCOL = "scf";
    expect(resolveRelayProtocol("http://123.207.66.24:9443")).toBe("scf");
    process.env.BILIBILI_RELAY_PROTOCOL = "target";
    expect(
      resolveRelayProtocol("https://1256194003-1pp3pgcc9p.ap-guangzhou.tencentscf.com")
    ).toBe("target");
    process.env.BILIBILI_RELAY_PROTOCOL = "TARGET";
    expect(resolveRelayProtocol("http://123.207.66.24:9443")).toBe("target");
  });

});

describe("bilibili 中继：412 风控退避重试", () => {
  // 2026-11-14/15 线上：B站对中继出口 IP 间歇性 412（两波各连续 7/10 次），
  // biliFetch 对 412 做 2 次退避重试（1.2s → 2.4s）。
  // 用真实定时器：假钟（vi.useFakeTimers）与 undici 对本地 socket 的真实 I/O
  // 混用会出现调用计数错乱/挂起。两次退避合计 3.6s，testTimeout 放宽到 10s。
  const TARGET = "https://api.bilibili.com/x/web-interface/view?bvid=BV1xx";

  it("前两次 412、第三次成功：重试后拿到 200", async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      if (calls <= 2) {
        res.writeHead(412, { "content-type": "text/html" });
        res.end("<!DOCTYPE html>");
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      }
    };

    const response = await biliFetch(TARGET);
    expect(calls).toBe(3);
    expect(response.status).toBe(200);
  }, 10000);

  it("持续 412：重试 2 次后抛出 412 错误（共请求 3 次）", async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      res.writeHead(412, { "content-type": "text/html" });
      res.end("<!DOCTYPE html>");
    };

    await expect(biliFetch(TARGET)).rejects.toThrow(/中继 HTTP 412/);
    expect(calls).toBe(3);
  }, 10000);

  it("非 412 不重试：中继自身拒绝（HTTP 500）只请求一次", async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("relay internal error");
    };

    await expect(biliFetch(TARGET)).rejects.toThrow(/中继 HTTP 500/);
    expect(calls).toBe(1);
  });

});

describe("b23 短链：412 也能拿到最终地址（relayAllowErrorStatus）", () => {
  // 2026-11-24 线上：B站对中继出口的 www.bilibili.com/video/* 页面恒定 412，
  // 而 b23.tv 短链解析只需要跳转后的地址。旧实现把 412 当失败 + 退避重试，
  // 27 次 b23 视频短链 100% 失败且每次多等 3.6s。
  const b23 = "https://b23.tv/27kOOvg";
  const finalUrl = "https://www.bilibili.com/video/BV1Qy411i7xf?share_source=COPY";

  it("412 + x-relay-final-url：不抛错、不重试，url 取最终地址", async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      res.writeHead(412, {
        "content-type": "text/html",
        "x-relay-final-url": encodeURIComponent(finalUrl),
      });
      res.end("<!DOCTYPE html><html><body>risk control</body></html>");
    };

    const response = await biliFetch(b23, { relayAllowErrorStatus: true });
    expect(calls).toBe(1);
    expect(response.status).toBe(412);
    expect(response.url).toBe(finalUrl);
    // 正文已缓冲，调用方仍能正常读取（不会因为连接被丢弃而报错）
    expect(await response.text()).toContain("risk control");
  });

  it("412 但没有 x-relay-final-url：仍按失败抛错（不吞掉真实故障）", async () => {
    handler = (_req, res) => {
      res.writeHead(412, { "content-type": "text/html" });
      res.end("<!DOCTYPE html>");
    };

    await expect(biliFetch(b23, { relayAllowErrorStatus: true })).rejects.toThrow(
      /中继 HTTP 412/
    );
  });

  it("未开该选项时行为不变：412 仍然重试后抛错", async () => {
    let calls = 0;
    handler = (_req, res) => {
      calls += 1;
      res.writeHead(412, {
        "content-type": "text/html",
        "x-relay-final-url": encodeURIComponent(finalUrl),
      });
      res.end("<!DOCTYPE html>");
    };

    await expect(biliFetch(b23)).rejects.toThrow(/中继 HTTP 412/);
    expect(calls).toBe(3);
  }, 10000);
});
