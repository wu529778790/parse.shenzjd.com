# =============================================================================
# 阶段 1：deps — 仅安装依赖（利用 Docker 层缓存）
# =============================================================================
FROM node:20-alpine AS deps

# 国内 npm 镜像源加速
RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# =============================================================================
# 阶段 2：builder — 编译 Next.js 应用
# =============================================================================
FROM node:20-alpine AS builder

RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 稳定构建 ID，避免多副本 / 滚动更新时前后端 build 不一致（Server Action 报错）
# 使用：docker build --build-arg BUILD_ID=$(git rev-parse HEAD) .
ARG BUILD_ID=local
ENV NEXT_BUILD_ID=${BUILD_ID}

# 构建应用（next.config.mjs 已启用 output: "standalone"）
# .env.local 已被 .dockerignore 排除，构建不会带入敏感配置
RUN npm run build

# =============================================================================
# 阶段 3：runner — 最小运行时镜像
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Next.js standalone 服务监听端口
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 非 root 用户运行（node:alpine 自带 node 用户，UID 1000）
USER node

# 复制 standalone 产物（已裁剪掉 devDependencies 与未引用代码）
# --chown=node:node 确保 node 用户可读
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000

# 健康检查：每 30s 探测 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# standalone 模式直接运行编译产物，无需 next start
CMD ["node", "server.js"]
