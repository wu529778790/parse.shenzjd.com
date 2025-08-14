# Parse 短视频解析站点

一个短视频解析服务，支持多个平台的视频解析。

提供了抖音、快手、微博、哔哩哔哩、皮皮虾、小红书、QQ音乐等多个平台的视频解析及下载功能。

在线体验：<https://parse.shenzjd.com>

> 免责声明：本项目仅用于技术学习与搜索聚合演示，不存储、不传播任何受版权保护的内容。请勿用于商业或侵权用途。

## 特点

- 高转化着陆页：简洁表单、即贴即得，降低用户流失
- 多平台覆盖：抖音/快手/微博/哔哩哔哩/小红书/QQ音乐/皮皮虾 等
- 轻维护低成本：静态资源+Serverless/容器均可部署
- SEO 友好：Next.js 架构，天然利于索引与收录
- 可私有化：一键 Docker 部署，独立域名与数据可控

## 一键部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fparse.shenzjd.com&project-name=parse&repository-name=parse.shenzjd.com)

### Cloudflare（Workers）

支持将核心 API 路由以 Workers 形式部署（适合全局加速与更低时延）。

已内置 `wrangler.toml` 与 `src/worker.js`

部署到 Workers：

```bash
pnpm run wrk:deploy
```

### Docker

```bash
# GHCR
docker pull ghcr.io/wu529778790/parse.shenzjd.com:latest
docker run --name parse -p 3000:3000 -d ghcr.io/wu529778790/parse.shenzjd.com:latest

# Docker Hub
docker pull docker.io/wu529778790/parse.shenzjd.com:latest
docker run --name parse -p 3000:3000 -d docker.io/wu529778790/parse.shenzjd.com:latest
```

## 许可证

MIT License
