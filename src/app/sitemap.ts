import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { VIDEO_PLATFORMS } from "@/config/video-platforms";

export default function sitemap(): MetadataRoute.Sitemap {
  const platformPages: MetadataRoute.Sitemap = Object.keys(
    VIDEO_PLATFORMS
  ).map((key) => ({
    url: `${siteConfig.url}/platform/${key}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...platformPages,
    {
      url: `${siteConfig.url}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteConfig.url}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteConfig.url}/legal/dmca`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
