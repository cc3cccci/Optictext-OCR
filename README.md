# OpticText 文字识别系统

部署在内网 Armbian 设备上的离线 OCR(文字识别)服务:上传图片或 PDF,自动识别文字,支持编辑、搜索与导出。前端完全离线打包,识别历史持久化在设备上,局域网内任何设备(手机、电脑)打开浏览器即可使用。

## 功能

- 图片识别:拍照、截图、扫描件,自动矫正手机照片方向(EXIF)
- PDF 识别:文字版 PDF 直接提取文本层(秒出),扫描版逐页 OCR(最多 10 页)
- 三种上传方式:点击上传(支持多选)、拖拽到窗口、截图后 Ctrl+V 粘贴
- 识别区域可视化:在原图上标出每一处识别到的文字,悬停可查看内容
- 历史记录:自动保存到设备(SQLite + 图片文件),支持按标题/内容搜索,刷新、换设备不丢失
- 文本编辑:修改自动保存;一键中文排版(合并断行);中英文字数统计
- 导出:TXT 文本、PDF(内嵌中文字体,无乱码)、复制到剪贴板(兼容内网 HTTP 环境)
- 图片查看:滚轮缩放、手机双指缩放、拖拽平移、旋转

## 架构

- 前端:React 19 + Vite + Tailwind CSS(构建产物无任何外网依赖)
- 后端:FastAPI + RapidOCR(PP-OCRv4 mobile,ONNXRuntime CPU 推理)+ PyMuPDF
- 存储:SQLite + 磁盘图片文件,位于 `data/` 目录(容器内 `/app/data`)
- 部署:单容器(FastAPI 同时托管前端静态文件),docker compose 管理

## 部署到 Armbian 设备

设备要求:aarch64(64 位)系统、Docker + docker compose v2、可用内存 ≥ 1GB、磁盘空闲 ≥ 4GB。

在内网电脑上执行(需 Python 3.8+):

```bash
pip install paramiko scp requests

# 1. 检查设备部署条件(架构/内存/磁盘/Docker/端口/网络)
export DEPLOY_PASSWORD='你的SSH密码'      # Windows: set DEPLOY_PASSWORD=你的SSH密码
python deploy.py --check

# 2. 部署(上传代码 -> 设备上构建镜像 -> 替换旧容器启动)
python deploy.py
```

完成后浏览器访问 `http://192.168.50.35:9999`(设备地址与端口可在 `deploy.py` / `docker-compose.yml` 中调整)。

### 手动部署

也可以把仓库拷到设备上直接构建:

```bash
docker compose up -d --build --remove-orphans
```

注意:不要使用 `docker compose build --pull`。国内网络 Docker Hub 通常不可达,构建依赖设备本地已缓存的 `node:20-slim` 与 `python:3.10-slim` 基础镜像;npm 与 pip 已在 Dockerfile 中配置为国内镜像源(npmmirror / 清华 PyPI)。

### 数据备份

识别历史(数据库 + 图片)全部位于部署目录的 `data/` 文件夹,直接拷贝该目录即可备份;删除该目录即清空全部历史。

## 本地开发

```bash
# 后端(需 Python 3.10)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端(另开终端,Vite 已配置 /api 代理到 8000)
npm install
npm run dev
```

## 测试

启动后端后运行端到端冒烟测试(覆盖上传、识别、历史、编辑、删除全链路):

```bash
python backend/test_api.py http://localhost:8000
```

## 常见问题

- 识别较慢:正常现象,Armbian 设备为 CPU 推理,单张图片数秒到数十秒;前端已在上传前自动压缩图片以加速。多个文件会排队依次识别。
- PDF 导出乱码:确认部署目录 `public/fonts/NotoSansSC-Regular-subset.ttf` 存在(该字体子集覆盖 GB2312 常用字符,极生僻字可能缺字,可改用导出 TXT)。
- 复制按钮无效:内网 HTTP 环境浏览器禁用剪贴板 API,系统已内置降级方案;仍失败时请手动全选复制。
- 换新设备部署:若新设备无法访问 Docker Hub 且没有基础镜像缓存,先在可联网机器上 `docker pull --platform linux/arm64 node:20-slim python:3.10-slim`,再 `docker save` / `docker load` 导入设备。
