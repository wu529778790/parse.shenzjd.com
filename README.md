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

## 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wu529778790/parse.shenzjd.com)

- 点击上方按钮，按向导授权并创建项目即可自动构建与发布。
- 若你已 fork 本仓库，点击后可在向导中选择你的 fork 进行部署。

---

### Docker

```bash
# GHCR
docker pull ghcr.io/wu529778790/parse.shenzjd.com:latest
docker run --name parse -p 3000:3000 -d ghcr.io/wu529778790/parse.shenzjd.com:latest

# Docker Hub
docker pull docker.io/wu529778790/parse.shenzjd.com:latest
docker run --name parse -p 3000:3000 -d docker.io/wu529778790/parse.shenzjd.com:latest
```

## 测试

### 单元测试（默认，无需外网）

```bash
pnpm test
```

包含 URL 提取 / 平台识别、`api-utils` 等本地逻辑，**不访问**各视频平台。

### 真机解析测试（直连上游，必配分享链接）

解析依赖各站实时页面与接口，**必须用真实分享链接**才能验证整条链路。

1. 复制模板并按平台填入你从 App 分享得到的链接（短链或详情页均可，失效后需更换）：

   - 模板文件：[`tests/live/urls.example.env`](tests/live/urls.example.env)
   - 将其中变量写入项目根目录的 `.env.local`（已加入 `.gitignore` 时不要提交真实链接）。

2. 执行：

   ```bash
   pnpm test:live
   ```

   该命令会设置 `RUN_LIVE_PARSE=1`，并对 **24 个解析路由** 各跑一条用例；**缺少任一 `LIVE_URL_*` 时会在 `beforeAll` 中报错并列出变量名**。

3. 可选：`LIVE_PARSE_TIMEOUT_MS`（默认 `120000`）用于单条用例超时（毫秒）。

4. 抖音 / 微博 / 哔哩哔哩等若解析失败，请检查 `.env.local` 中是否按需配置了 `DOUYIN_COOKIE`、`WEIBO_COOKIE`、`BILIBILI_COOKIE`（与 `API.md` 一致）。

说明：真机测试受地区、风控、Cookie 与链接失效影响，失败时请更换有效分享链或网络环境后重试。

## 许可证

MIT License
