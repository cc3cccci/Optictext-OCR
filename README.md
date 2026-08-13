# OpticText 文字识别系统

部署在内网 Armbian 设备上的离线 OCR 服务:上传图片或 PDF,自动识别文字,支持编辑、搜索与导出。前端完全离线打包,识别历史持久化在设备上,局域网内手机、电脑打开浏览器即可使用。

## 功能

- 图片识别:拍照、截图、扫描件,自动矫正手机照片方向(EXIF),CLAHE 增强对比度
- PDF 识别:文字版直接提取文本层;扫描版逐页 OCR(最多 10 页),可翻页预览
- 上传方式:点击上传、拖拽、Ctrl+V 粘贴、**手机拍照**(后置相机)
- 图文互链:点击识别框定位文本,点击文本高亮原图;低置信度框为琥珀色
- 进度可见:队列位置、PDF 页进度、已耗时;失败记录保留并可一键重试
- 排版模式:原文 / 自然段 / 单行(不重新跑模型);可忽略页眉页脚(图上拖动色带)
- 历史记录:SQLite WAL + 原件落盘,按标题/内容搜索,刷新、换设备不丢失
- 导出:TXT、双层可检索 PDF、复制(兼容内网 HTTP)
- 图片查看:滚轮/双指缩放、拖拽平移、旋转、可拖拽左右分栏

## 架构

- 前端:React 19 + Vite + Tailwind CSS(构建产物无任何外网依赖)
- 后端:FastAPI + RapidOCR(PP-OCRv4 mobile,ONNX Runtime CPU)+ PyMuPDF
- 识别:异步任务(上传立即返回),弱设备上串行 + 默认 2 推理线程
- 存储:`data/scans.db`、`data/images/`、`data/originals/`
- 部署:单容器,docker compose 管理

## 手机访问

在同一局域网用手机浏览器打开 `http://192.168.50.35:9999`,点顶栏「拍照」即可拍摄纸质文件。删除按钮在触屏上始终可见。请使用 HTTP 下的 Ctrl+V / 系统粘贴,不要依赖剪贴板 API。

## 部署到 Armbian 设备

设备要求:aarch64、Docker + compose v2、可用内存 ≥ 1GB、磁盘空闲 ≥ 4GB。

```bash
pip install paramiko scp requests

export DEPLOY_PASSWORD='你的SSH密码'          # 或 DEPLOY_SSH_KEY=/path/to/id_rsa
python deploy.py --check
python deploy.py                              # 首次连接未知主机可加 --insecure
```

完成后访问 `http://192.168.50.35:9999`。

交给本机可 SSH 的 Agent 时,请使用仓库根目录 [`DEPLOY_HANDOFF.md`](DEPLOY_HANDOFF.md):内含预检、部署、异步验收、回滚与故障排查的完整命令。

不要使用 `docker compose build --pull`。国内网络 Docker Hub 通常不可达,构建依赖设备已缓存的 `node:20-slim` 与 `python:3.10-slim`;Dockerfile 的 apt 层保持不变以命中缓存。npm / pip 使用 npmmirror 与清华源。

容器限制:内存 2G、CPU 3 核、`OMP_NUM_THREADS=2` / `ORT_INTRA_OP=2`,避免把板子打满。

### 数据备份

拷贝部署目录的 `data/` 即可;删除该目录即清空历史。

## 本地开发

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 另开终端
npm install
npm run dev
```

## 测试

```bash
python backend/test_layout.py                 # 排版 / 忽略带 / 可检索 PDF,无需 OCR
python backend/test_api.py http://localhost:8000   # 需先启动后端
```

前端:`npx tsc --noEmit` 与 `npm run build`。

## 常见问题

- 识别较慢:Armbian 为 CPU 推理,单张数秒到数十秒。前端会显示队列和页进度;上传前会压缩图片。
- 首张更慢:进程启动时会 warmup 模型,健康检查通过后再上传更稳。
- 可检索 PDF:由服务端按文字框写入不可见文字层,可在阅读器里搜索/复制。
- 不做的事:不升级 PP-OCRv5 server 大模型、不引入 Redis/Celery、不提供账号体系、不做系统级截图热键。
