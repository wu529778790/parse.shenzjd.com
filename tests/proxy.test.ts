// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/proxy/route";

describe("proxy route", () => {
  const originalFetch = global.fetch;
  const originalCookie = process.env.BILIBILI_COOKIE;
  const originalUA = process.env.BILIBILI_USER_AGENT;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BILIBILI_COOKIE = "SESSDATA=test-cookie";
    process.env.BILIBILI_USER_AGENT = "UnitTestBiliUA/1.0";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.BILIBILI_COOKIE = originalCookie;
    process.env.BILIBILI_USER_AGENT = originalUA;
  });

  it("adds bilibili-specific headers for CDN media requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("video", {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "5",
          "accept-ranges": "bytes",
        },
      })
    );
    global.fetch = fetchMock;

    const req = new NextRequest(
      "http://127.0.0.1/api/proxy?url=https%3A%2F%2Fupos-sz-mirrorcosov.bilivideo.com%2Fupgcxcode%2Fxx%2Farchive%2Fvideo.m4s",
      {
        headers: {
          range: "bytes=0-1",
          "user-agent": "BrowserUA/99.0",
        },
      }
    );

    const res = await GET(req);

    expect(res.status).toBe(206);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://upos-sz-mirrorcosov.bilivideo.com/upgcxcode/xx/archive/video.m4s",
      expect.objectContaining({
        redirect: "follow",
        headers: expect.objectContaining({
          "User-Agent": "UnitTestBiliUA/1.0",
          Referer: "https://www.bilibili.com/",
          Origin: "https://www.bilibili.com",
          Cookie: "SESSDATA=test-cookie",
          Range: "bytes=0-1",
          Accept: "*/*",
        }),
      })
    );
  });

  it("blocks private network targets", async () => {
    const req = new NextRequest(
      "http://127.0.0.1/api/proxy?url=http%3A%2F%2F192.168.1.2%2Fvideo.mp4"
    );

    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("private network");
  });
});
