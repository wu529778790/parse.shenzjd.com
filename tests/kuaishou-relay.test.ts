// @ts-nocheck
/**
 * 快手走国内中继的单元测试（2026-11-24）。
 *
 * 背景：`m.gifshow.com/fw/photo/<id>` 从本站出口（新加坡）单次要 4.9–11.3s，
 * 从广州中继机 1.1s，15s 超时在高峰期被击穿（72h 快手失败 161 次）。
 * 这里用本地 HTTP 服务冒充中继，验证：
 * - 配置中继后，重定向展开与分享页请求都走 `?target=` 直通协议并带令牌；
 * - 短链展开依赖中继回传的 x-relay-final-url（主服务看到的只是中继地址）；
 * - 没配中继 / 指向旧 SCF 信封中继时，退回原生 fetch（行为不变）。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { parseKuaishou } from "@/lib/kuaishouCore";
import {
  kuaishouRelayEndpoint,
  resetKuaishouRelayState,
} from "@/lib/kuaishou-fetch";

const GIFSHOW_PAGE = `<html><script>var d={"photoId":"abc123","mainMvUrls":[{"cdn":"kwaicdn","url":"https:\\/\\/v.kwaicdn.com\\/x.mp4"}],"webpCoverUrls":[{"url":"https:\\/\\/p.a.kwimgs.com\\/c.jpg"}],"caption":"测试视频","name":"测试作者"}</script></html>`;

let server: http.Server;
let baseUrl = "";
let handler = null;
let seen = [];

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    await handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const original = {
  ksUrl: process.env.KUAISHOU_RELAY_URL,
  ksToken: process.env.KUAISHOU_RELAY_TOKEN,
  biliUrl: process.env.BILIBILI_RELAY_URL,
  biliToken: process.env.BILIBILI_RELAY_TOKEN,
};

beforeEach(() => {
  seen = [];
  resetKuaishouRelayState();
  delete process.env.KUAISHOU_RELAY_URL;
  delete process.env.BILIBILI_RELAY_URL;
  delete process.env.KUAISHOU_RELAY_TOKEN;
  delete process.env.BILIBILI_RELAY_TOKEN;
});

afterEach(() => {
  for (const [value, name] of [
    [original.ksUrl, "KUAISHOU_RELAY_URL"],
    [original.ksToken, "KUAISHOU_RELAY_TOKEN"],
    [original.biliUrl, "BILIBILI_RELAY_URL"],
    [original.biliToken, "BILIBILI_RELAY_TOKEN"],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** 中继替身：短链目标回 x-relay-final-url，其余回分享页（带 extract 时代提取） */
function relayHandler(req, res) {
  const query = new URL(req.url, "http://relay").searchParams;
  const target = query.get("target");
  if (target && target.includes("www.kuaishou.com")) {
    res.writeHead(200, {
      "content-type": "application/json",
      "x-relay-final-url": encodeURIComponent(
        "https://www.kuaishou.com/short-video/abc123"
      ),
    });
    res.end('{"result":2}');
    return;
  }
  // 代提取：中继把 160KB 页面压成约 1KB 的最小 HTML 再回
  if (query.get("extract") === "kuaishou-min-html") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ html: GIFSHOW_PAGE, bytes: 160627, upstreamMs: 1028 }));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(GIFSHOW_PAGE);
}

describe("快手出口选择", () => {
  it("未配置任何中继地址时返回空串（走原生 fetch）", () => {
    expect(kuaishouRelayEndpoint()).toBe("");
  });

  it("只配 BILIBILI_RELAY_URL 不启用快手中继（160KB 跨境回传是负优化）", () => {
    // 2026-11-24 实测：中继 12.3/34.3/27.3s vs 直连 10.2/10.8/7.0s，
    // 中继只压低了上游首字节，大响应体的回程更慢
    process.env.BILIBILI_RELAY_URL = "http://123.207.66.24:9443";
    expect(kuaishouRelayEndpoint()).toBe("");
  });

  it("显式配置 KUAISHOU_RELAY_URL 才启用，并去掉尾斜杠", () => {
    process.env.BILIBILI_RELAY_URL = "http://123.207.66.24:9443";
    process.env.KUAISHOU_RELAY_URL = "http://123.207.66.24:9443/";
    expect(kuaishouRelayEndpoint()).toBe("http://123.207.66.24:9443");
  });

  it("指向旧 SCF 信封中继时不接（协议不同、白名单不含快手域名）", () => {
    process.env.BILIBILI_RELAY_URL =
      "https://1256194003-1pp3pgcc9p.ap-guangzhou.tencentscf.com";
    expect(kuaishouRelayEndpoint()).toBe("");
  });
});

describe("快手经中继解析", () => {
  it("/f/ 长链：重定向展开与分享页都走中继，短链地址取 x-relay-final-url", async () => {
    process.env.KUAISHOU_RELAY_URL = baseUrl;
    process.env.KUAISHOU_RELAY_TOKEN = "ks-token";
    handler = relayHandler;

    const result = await parseKuaishou("https://www.kuaishou.com/f/X-abc123");

    expect(result.code).toBe(200);
    expect(result.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
    expect(result.data.caption).toBe("测试视频");

    // 两次请求都打到中继，且都带鉴权头
    expect(seen.length).toBe(2);
    for (const req of seen) {
      expect(req.headers["x-relay-token"]).toBe("ks-token");
    }
    const targets = seen.map(
      (r) => new URL(r.url, "http://relay").searchParams.get("target")
    );
    expect(targets[0]).toBe("https://www.kuaishou.com/f/X-abc123");
    expect(targets[1]).toBe("https://m.gifshow.com/fw/photo/abc123");
    // 分享页请求必须带代提取名（160KB 跨境回传是负优化，见 kuaishou-fetch.js）
    const shareQuery = new URL(seen[1].url, "http://relay").searchParams;
    expect(shareQuery.get("extract")).toBe("kuaishou-min-html");
    // 短链 302 没有正文可提取，不该带 extract
    const shortQuery = new URL(seen[0].url, "http://relay").searchParams;
    expect(shortQuery.get("extract")).toBeNull();
  });

  it("代提取无结果（html 为空）时回退直连重取，功能不退化", async () => {
    resetKuaishouRelayState();
    process.env.KUAISHOU_RELAY_URL = baseUrl;
    handler = (req, res) => {
      const query = new URL(req.url, "http://relay").searchParams;
      if (query.get("extract")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ html: "", bytes: 160627 }));
        return;
      }
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("relay stub");
    };

    // 目标站用本地服务冒充，避免单测打外网
    const target = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(GIFSHOW_PAGE);
    });
    await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
    const targetUrl = `http://127.0.0.1:${target.address().port}`;

    try {
      const result = await parseKuaishou(`${targetUrl}/fw/photo/abc123`);
      expect(result.code).toBe(200);
      expect(result.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
    } finally {
      await new Promise((resolve) => target.close(resolve));
      resetKuaishouRelayState();
    }
  });

  it("中继未放行该域名（400 bad target）时退回直连，该次解析照常成功", async () => {
    // 部署有先后：parse 代码先上、中继镜像后上时，不能让快手整体不可用
    resetKuaishouRelayState();
    process.env.KUAISHOU_RELAY_URL = baseUrl;
    handler = (req, res) => {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad target");
    };

    // 目标站用本地服务冒充，避免单测打外网
    const target = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(GIFSHOW_PAGE);
    });
    await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
    const targetUrl = `http://127.0.0.1:${target.address().port}`;
    const link = `${targetUrl}/fw/photo/abc123`;

    try {
      const first = await parseKuaishou(link);
      expect(first.code).toBe(200);
      expect(first.data.photoUrl).toBe("https://v.kwaicdn.com/x.mp4");
      const relayHits = seen.length;
      expect(relayHits).toBe(1);

      // 冷却期内直接走直连，不再每个请求都白跑一次中继
      const second = await parseKuaishou(link);
      expect(second.code).toBe(200);
      expect(seen.length).toBe(relayHits);
    } finally {
      await new Promise((resolve) => target.close(resolve));
      resetKuaishouRelayState();
    }
  });
});
