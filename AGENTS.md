# AGENTS.md

## Cursor Cloud specific instructions

OpticText 是一个离线中文 OCR 应用,由两个服务组成:

- 后端:FastAPI + RapidOCR(PP-OCRv4,ONNX Runtime CPU)+ PyMuPDF,`uvicorn` 监听 `8000`。
- 前端:React 19 + Vite,dev server 监听 `3000`,把 `/api/` 代理到后端 `8000`。

标准的安装/运行/测试命令见 `README.md`(「本地开发」「测试」两节)。下面只记录非显而易见、容易踩坑的点。

### Python 版本必须是 3.10

`backend/requirements.txt` 固定了 `rapidocr-onnxruntime==1.3.14`,该版本要求 `Python <3.12`,在系统默认的 Python 3.12 下 **无法安装**(pip 找不到匹配版本)。生产镜像用的是 `python:3.10-slim`,因此本地也用 Python 3.10。依赖装在 `backend/.venv`(由启动更新脚本创建/刷新)。运行后端时用该 venv:

```bash
backend/.venv/bin/uvicorn main:app --reload --port 8000   # 在 backend/ 目录下
```

### 启动顺序与 OCR 模型 warmup

- 先启动后端再启动前端(前端只是代理,后端不在时页面会显示「无法连接后端服务」)。
- 后端进程启动时会加载 OCR 模型,首个请求前需 warmup。用 `GET /api/health` 确认就绪:返回 `{"status":"ok","model_loaded":true,"threads":2}` 才算可用。
- OCR 是 **异步** 的:`POST /api/ocr` 立即返回 `status: PROCESSING`,需轮询 `GET /api/scans/{id}` 直到 `READY`/`ERROR`。

### 前端 dev server 的 `/api/` 代理

`vite.config.ts` 的代理键必须是带斜杠的 `'/api/'`(不是 `'/api'`)。前端源码里有一个模块 `api.ts`,dev server 会以 `/api.ts` 提供它;如果代理键写成 `'/api'`(前缀匹配),`/api.ts` 也会被代理到后端(404),导致整个应用在浏览器里加载失败(白屏)。所有真实后端路由都以 `/api/` 开头,所以用 `'/api/'` 既能代理所有接口又不会误伤源码模块。

### 数据与存储

识别历史存在 `data/`(SQLite `scans.db` + `images/` + `originals/`),已在 `.gitignore` 中忽略。删除 `data/` 即清空历史;测试脚本会自行清理自己创建的数据。

### Lint / 测试 / 构建 速查

- 前端类型检查:`npx tsc --noEmit`;前端构建:`npm run build`。
- 后端无需 OCR 的单测:`backend/.venv/bin/python backend/test_layout.py`、`backend/.venv/bin/python backend/test_db.py`。
- 后端完整 API 测试(需先启动后端,且 venv 内需 `requests`):`backend/.venv/bin/python backend/test_api.py http://localhost:8000`。
