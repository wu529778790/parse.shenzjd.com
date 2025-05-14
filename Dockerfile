# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# 复制源码
COPY next.config.ts ./
COPY tsconfig.json ./
COPY public ./public
COPY src ./src

# 清除缓存
RUN rm -rf .next
# 构建
RUN pnpm build

# 安装 puppeteer 运行所需依赖（不安装chromium包）
RUN apk add --no-cache \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    dumb-init

# 手动下载 puppeteer 官方 Chromium
RUN npx puppeteer browsers install chrome

# ---- 生产阶段 ----
FROM node:20-alpine

WORKDIR /app

# 安装 puppeteer 运行所需依赖（不安装chromium包）
RUN apk add --no-cache \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    dumb-init

# 复制 puppeteer 的 Chromium
COPY --from=builder /root/.cache/puppeteer /root/.cache/puppeteer

# 设置环境变量
ENV NODE_ENV=production

# 复制 node_modules 和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/src ./src

# 安装 pnpm
RUN npm install -g pnpm

EXPOSE 3000

CMD ["pnpm", "start"]