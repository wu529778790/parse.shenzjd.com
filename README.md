# Parse 短视频解析站点

一个即开即用的短视频/音乐一站式解析与下载站点。开箱即用、极速部署、支持多平台，适合个人站长、内容创作者、公众号/社群引流场景与商业落地页搭建。

— 打造你的“解析门户”，为流量转化与品牌曝光加速。

## 特点

- 高转化着陆页：简洁表单、即贴即得，降低用户流失
- 多平台覆盖：抖音/快手/微博/哔哩哔哩/小红书/QQ音乐/皮皮虾 等
- 轻维护低成本：静态资源+Serverless/容器均可部署
- SEO 友好：Next.js 架构，天然利于索引与收录
- 可私有化：一键 Docker 部署，独立域名与数据可控

## 一键部署

> 推荐优先使用 Vercel（最省心），或 Docker（最稳定可控）。

### Vercel（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fparse.shenzjd.com&project-name=parse&repository-name=parse.shenzjd.com)

部署要点：

- Framework Preset: Next.js
- Install Command: `pnpm install`
- Build Command: `pnpm build`
- Output: 自动识别（Next.js）

### Cloudflare（Pages）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fparse.shenzjd.com)

部署要点：

- 构建系统：Pages（选择 Git 集成）
- Framework Preset: Next.js
- Install: `pnpm install`
- Build: `pnpm build`
- Output Directory: 自动或根据提示配置

提示：如需更强 SSR/Edge 支持，可按需集成 `next-on-pages` 适配器。

### Docker（私有化/服务器）

快速启动：

```bash
docker run -d \
  --name parse \
  -p 3000:3000 \
  -e NODE_ENV=production \
  ghcr.io/wu529778790/parse.shenzjd.com:latest
```

或使用已发布镜像：

```bash
docker run -d -p 3000:3000 --name parse wu529778790/parse.shenzjd.com:latest
```

Docker Compose：

```yaml
version: "3.8"
services:
  app:
    image: ghcr.io/wu529778790/parse.shenzjd.com:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

## 许可证

MIT License
