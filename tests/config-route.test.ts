// @ts-nocheck
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/config/route.js";

describe("config route", () => {
  const originalEnv = process.env.VIDEO_PARSE_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VIDEO_PARSE_ENABLED;
    } else {
      process.env.VIDEO_PARSE_ENABLED = originalEnv;
    }
  });

  it("returns videoParseEnabled=false when the env var is not set", async () => {
    delete process.env.VIDEO_PARSE_ENABLED;

    const res = await GET(new Request("http://localhost:3000/api/config"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.code).toBe(200);
    expect(body.msg).toBe("ok");
    expect(body.data.videoParseEnabled).toBe(false);
  });

  it("returns videoParseEnabled=false for values other than \"true\"", async () => {
    process.env.VIDEO_PARSE_ENABLED = "1";

    const res = await GET(new Request("http://localhost:3000/api/config"));
    const body = await res.json();

    expect(body.data.videoParseEnabled).toBe(false);
  });

  it("returns videoParseEnabled=true when VIDEO_PARSE_ENABLED=true", async () => {
    process.env.VIDEO_PARSE_ENABLED = "true";

    const res = await GET(new Request("http://localhost:3000/api/config"));
    const body = await res.json();

    expect(body.data.videoParseEnabled).toBe(true);
  });

  it("disables caching so the switch takes effect immediately", async () => {
    const res = await GET(new Request("http://localhost:3000/api/config"));

    expect(res.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });
});
