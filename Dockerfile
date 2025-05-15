FROM node:18-bullseye

WORKDIR /app

# 安装 puppeteer 所需依赖
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

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

# 构建
RUN pnpm build

# 生产环境变量
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 3000

CMD ["pnpm", "start"]