# 神族九帝 短视频解析站点

一个短视频解析服务，支持 24+ 平台的视频解析与下载。

在线体验：<https://parse.shenzjd.com>

> 免责声明：本项目仅用于技术学习与搜索聚合演示，不存储、不传播任何受版权保护的内容。请勿用于商业或侵权用途。

## 支持平台

抖音、快手、微博、哔哩哔哩、小红书、皮皮虾、皮皮搞笑、汽水音乐、绿洲、火山、微视、西瓜视频、最右、度小视、梨视频、虎牙、AcFun、美拍、逗拍、全民K歌、六间房、新片场、好看视频、X（Twitter）。

> 注：平台解析能力依赖各站实时接口，部分平台可能受风控/地区影响暂时不可用。

## 特点

- 高转化着陆页：简洁表单、即贴即得，降低用户流失
- 多平台覆盖：抖音/快手/B站/微博/小红书/西瓜/虎牙/X 等 24+ 平台
- 轻维护低成本：静态资源+Serverless/容器均可部署
- SEO 友好：Next.js 架构，天然利于索引与收录
- 可私有化：一键 Docker 部署，独立域名与数据可控

## 一键部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwu529778790%2Fparse.shenzjd.com&project-name=parse&repository-name=parse.shenzjd.com)

### Cloudflare（Workers / OpenNext）

本项目通过 [OpenNext](https://opennext.js.org/cloudflare) 适配器部署到 **Cloudflare Workers 免费层**（无需付费计划）。部署内容为静态页面 + 解析 API；视频不再走代理，解析结果直链播放/下载。

**推送即自动部署**：仓库已配置 [`.github/workflows/deploy-to-cloudflare.yaml`](.github/workflows/deploy-to-cloudflare.yaml)，push 到 `main` 时自动执行：单元测试 → OpenNext 构建 → `wrangler deploy` → 注入 Cookie 环境变量。

**首次配置（一次性）**：

1. 创建 Cloudflare API Token：Cloudflare Dashboard → My Profile → API Tokens → Create Token，选择 **Edit Cloudflare Workers** 模板（权限含 `Workers Scripts: Edit`），记录 Token 与 Account ID。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加：
   - `CLOUDFLARE_API_TOKEN`：上一步创建的 Token
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID
   - 可选（用于提升解析成功率）：`DOUYIN_COOKIE`、`WEIBO_COOKIE`、`BILIBILI_COOKIE`
3. 之后每次 push 到 `main` 即自动部署。

**本地构建与预览**：

```bash
npm run cf:build    # 构建 .open-next/ 产物
npm run cf:preview  # wrangler 本地预览
npm run cf:deploy   # 手动部署到 Workers
```

> 说明：Cloudflare 免费层不支持流式响应，`/api/proxy` 视频代理已移除，视频/图片一律直链；B站/小红书等防盗链平台直链 403 时页面会提示在新窗口打开。免费层另有 CPU 10ms/请求与内存限流隔离限制，解析成功率建议上线后实测。

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
npm test
```

包含 URL 提取 / 平台识别、`api-utils` 等本地逻辑，**不访问**各视频平台。

### 真机解析测试（直连上游，必配分享链接）

解析依赖各站实时页面与接口，**必须用真实分享链接**才能验证整条链路。

1. 复制模板并按平台填入你从 App 分享得到的链接（短链或详情页均可，失效后需更换）：

   - 模板文件：[`tests/live/urls.example.env`](tests/live/urls.example.env)
   - 将其中变量写入项目根目录的 `.env.local`（已加入 `.gitignore` 时不要提交真实链接）。

2. 执行：

   ```bash
   npm run test:live
   ```

   该命令会设置 `RUN_LIVE_PARSE=1`，并对 **24 个解析路由** 各跑一条用例；**缺少任一 `LIVE_URL_*` 时会在 `beforeAll` 中报错并列出变量名**。

3. 可选：`LIVE_PARSE_TIMEOUT_MS`（默认 `120000`）用于单条用例超时（毫秒）。

4. 抖音 / 微博 / 哔哩哔哩等若解析失败，请检查 `.env.local` 中是否按需配置了 `DOUYIN_COOKIE`、`WEIBO_COOKIE`、`BILIBILI_COOKIE`（与 `API.md` 一致）。

说明：真机测试受地区、风控、Cookie 与链接失效影响，失败时请更换有效分享链或网络环境后重试。

## 许可证

MIT License
