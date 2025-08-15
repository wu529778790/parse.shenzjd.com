# 使用 Node.js 官方镜像作为基础镜像
FROM node:20-alpine AS base

# 设置环境变量优化构建
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 安装 pnpm 并设置缓存
RUN corepack enable
RUN corepack prepare pnpm@9 --activate

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖（只安装生产依赖）
RUN pnpm config set store-dir /root/.local/share/pnpm/store
RUN pnpm install --frozen-lockfile --prod=false

# 复制源代码和配置文件
COPY next.config.mjs ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.mjs ./
COPY src ./src
COPY public ./public

# 构建应用
RUN pnpm build

# 生产阶段
FROM node:20-alpine AS runner
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 安装 pnpm 并创建用户（合并 RUN 指令）
RUN corepack enable && \
    corepack prepare pnpm@9 --activate && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物和运行时文件
COPY --from=base --chown=nextjs:nodejs /app/package.json ./
COPY --from=base --chown=nextjs:nodejs /app/next.config.mjs ./
COPY --from=base --chown=nextjs:nodejs /app/public ./public
COPY --from=base --chown=nextjs:nodejs /app/.next ./.next
COPY --from=base --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动应用
CMD ["pnpm", "start"]