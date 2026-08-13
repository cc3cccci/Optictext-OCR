# ---------- 前端构建阶段 ----------
# 注意:基础镜像 tag 保持不变(node:20-slim / python:3.10-slim),
# 目标设备(Armbian)无法访问 Docker Hub,但本地已缓存这两个镜像,
# 构建时请勿使用 --pull。
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
# 国内网络环境使用 npmmirror 镜像源,避免 npm 官方源不可达/过慢
RUN npm config set registry https://registry.npmmirror.com && npm install
COPY . .
RUN npm run build

# ---------- 后端运行阶段 ----------
FROM python:3.10-slim

# OpenCV 运行时依赖。此层命令与历史版本保持一致以命中设备上的构建缓存(离线可用)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 后端依赖:清华 PyPI 镜像(设备实测官方 PyPI 可达但镜像源更快更稳)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 后端代码
COPY backend ./backend

# 前端构建产物(FastAPI 直接托管,单容器部署)
COPY --from=frontend-builder /app/dist ./static

# 识别历史与图片存储目录(由 docker-compose 挂载持久化)
RUN mkdir -p /app/data/images

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
