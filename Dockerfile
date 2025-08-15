# 使用 Node.js 官方镜像作为基础镜像
FROM node:20-alpine AS base

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制所有源代码和配置文件
COPY . .

# 构建应用
RUN pnpm build

# 生产阶段
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 安装 pnpm
RUN npm install -g pnpm

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base /app/next.config.mjs ./next.config.mjs
COPY --from=base /app/public ./public
COPY --from=base /app/.next ./.next

# 安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 设置正确的权限
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动应用
CMD ["pnpm", "start"]