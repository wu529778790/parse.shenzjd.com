// @ts-nocheck
import { describe, expect, it } from "vitest";
import { normalizeResult } from "@/lib/normalize-result";

describe("normalizeResult：统一响应模型", () => {
  it("快手：photoUrl→url, caption→title, coverUrl→cover, authorName→author，且保留原始字段", () => {
    const input = {
      code: 200,
      msg: "解析成功",
      platform: "kuaishou",
      data: {
        photoUrl: "https://v.kuaishou.com/video.mp4",
        caption: "快手里的猫",
        coverUrl: "https://v.kuaishou.com/cover.jpg",
        authorName: "作者甲",
        source: "apollo-state-object",
      },
    };
    const out = normalizeResult(input);
    expect(out.code).toBe(200);
    expect(out.data.url).toBe("https://v.kuaishou.com/video.mp4");
    expect(out.data.title).toBe("快手里的猫");
    expect(out.data.cover).toBe("https://v.kuaishou.com/cover.jpg");
    expect(out.data.author).toBe("作者甲");
    // 向后兼容：原始字段仍在
    expect(out.data.photoUrl).toBe("https://v.kuaishou.com/video.mp4");
    expect(out.data.source).toBe("apollo-state-object");
  });

  it("皮皮搞笑：video→url", () => {
    const input = {
      code: 200,
      msg: "解析成功",
      data: { title: "标题", cover: "c.jpg", video: "https://v.mp4" },
    };
    const out = normalizeResult(input);
    expect(out.data.url).toBe("https://v.mp4");
    expect(out.data.title).toBe("标题");
  });

  it("汽水音乐：name→title，音乐扩展字段保留", () => {
    const input = {
      code: 200,
      msg: "解析成功",
      data: {
        name: "歌名",
        url: "https://m.mp3",
        cover: "c.jpg",
        lyrics: "lrc",
        core: "歌手",
        copyright: "©",
      },
    };
    const out = normalizeResult(input);
    expect(out.data.title).toBe("歌名");
    expect(out.data.name).toBe("歌名");
    expect(out.data.lyrics).toBe("lrc");
    expect(out.data.core).toBe("歌手");
  });

  it("抖音等已统一结构：幂等，不改变已有字段", () => {
    const input = {
      code: 200,
      msg: "解析成功",
      data: {
        title: "t",
        author: "a",
        avatar: "av.jpg",
        cover: "c.jpg",
        url: "u.mp4",
        like: 10,
        music: { author: "m" },
      },
    };
    expect(normalizeResult(input)).toEqual(input);
  });

  it("bilibili：code 1→200，分P 数组归入 videos，顶层字段移入 data", () => {
    const input = {
      code: 1,
      msg: "解析成功！",
      title: "B站视频",
      imgurl: "https://cover.jpg",
      desc: "描述",
      user: { name: "UP主", user_img: "https://avatar.jpg" },
      data: [
        {
          title: "P1",
          duration: 180,
          durationFormat: "00:03:00",
          accept: ["高清 1080P+"],
          video_url: "https://p1.mp4",
        },
        {
          title: "P2",
          duration: 90,
          durationFormat: "00:01:30",
          accept: [],
          video_url: "https://p2.mp4",
        },
      ],
    };
    const out = normalizeResult(input);
    expect(out.code).toBe(200);
    expect(out.data.title).toBe("B站视频");
    expect(out.data.desc).toBe("描述");
    expect(out.data.cover).toBe("https://cover.jpg");
    expect(out.data.author).toBe("UP主");
    expect(out.data.avatar).toBe("https://avatar.jpg");
    expect(out.data.videos).toHaveLength(2);
    expect(out.data.videos[0]).toMatchObject({
      title: "P1",
      url: "https://p1.mp4",
      duration: 180,
      durationFormat: "00:03:00",
      accept: ["高清 1080P+"],
    });
  });

  it("bilibili 无分P数据时不产生空 videos", () => {
    const input = { code: 1, msg: "ok", title: "t", data: [] };
    const out = normalizeResult(input);
    expect(out.code).toBe(200);
    expect(out.data.videos).toEqual([]);
  });

  it("错误响应不被归一化（原对象返回）", () => {
    const err = { code: 400, msg: "解析失败" };
    expect(normalizeResult(err)).toBe(err);
  });

  it("已存在统一字段时不被空值/旧字段覆盖", () => {
    const input = {
      code: 200,
      msg: "解析成功",
      data: { url: "https://u.mp4", photoUrl: "", caption: "标题" },
    };
    const out = normalizeResult(input);
    expect(out.data.url).toBe("https://u.mp4");
    expect(out.data.title).toBe("标题");
  });

  it("非对象输入原样返回", () => {
    expect(normalizeResult(null)).toBeNull();
    expect(normalizeResult(undefined)).toBeUndefined();
    expect(normalizeResult("str")).toBe("str");
  });
});
