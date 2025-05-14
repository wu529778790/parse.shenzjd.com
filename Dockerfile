# 使用官方 puppeteer 镜像，内置 Chromium
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install

# 复制源码
COPY next.config.ts ./
COPY tsconfig.json ./
COPY public ./public
COPY src ./src

# 构建
RUN pnpm build

# 生产环境变量
ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]