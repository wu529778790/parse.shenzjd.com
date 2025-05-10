# 使用 Node.js 官方镜像作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install

# 只复制必要的文件
COPY next.config.ts ./
COPY tsconfig.json ./
COPY public ./public
COPY src ./src

# 构建应用
RUN pnpm build

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["pnpm", "start"] 