# 使用 Node.js 官方镜像
FROM node:20-alpine AS base

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# Dependencies stage
FROM base AS deps
# 安装所有依赖（包括 devDependencies，因为构建时需要）
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
# 设置构建参数
ARG DEPLOYMENT_TARGET=docker

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
# 复制源代码
COPY . .

# 设置构建环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DEPLOYMENT_TARGET=$DEPLOYMENT_TARGET

# 构建应用
RUN pnpm build

# Production stage
FROM base AS runner
# 设置运行环境
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 仅安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 复制构建产物 - Next.js standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 更改文件所有者
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3000

# 启动应用 - 使用 standalone 服务器
CMD ["node", "server.js"]