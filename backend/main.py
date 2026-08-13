"""OpticText OCR 后端服务。

- POST /api/ocr          上传图片/PDF,识别并写入历史
- GET  /api/scans        历史列表(不含分段坐标)
- GET  /api/scans/{id}   单条详情(含文字框坐标)
- PATCH /api/scans/{id}  保存编辑后的文本
- DELETE /api/scans/{id} 删除记录及图片文件
- GET  /api/health       健康检查
- /api/images/*          识别图片静态服务
- /*                     前端静态资源(生产模式)
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from . import db
    from .ocr import OCRProcessor
except ImportError:
    import db
    from ocr import OCRProcessor

# 上传大小上限(前端已压缩,此处为兜底保护,防止大文件拖垮弱设备)
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# OCR 为 CPU 密集型任务,弱设备上串行执行,后续请求排队
_ocr_semaphore = asyncio.Semaphore(1)

app = FastAPI(title="OpticText OCR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

try:
    ocr_service = OCRProcessor()
except Exception as e:  # 模型初始化失败时服务仍可启动,便于排查
    print(f"OCR 引擎初始化失败: {e}")
    ocr_service = None


class TextUpdate(BaseModel):
    extracted_text: str


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model_loaded": ocr_service is not None}


@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    if not ocr_service:
        raise HTTPException(status_code=503, detail="OCR 引擎未就绪,请检查服务日志")

    filename = os.path.basename(file.filename or "untitled")
    content_type = (file.content_type or "").lower()
    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
    is_image = content_type.startswith("image/")

    if not (is_pdf or is_image):
        raise HTTPException(status_code=400, detail="仅支持图片或 PDF 文件")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="文件内容为空")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大(上限 {MAX_UPLOAD_BYTES // 1024 // 1024}MB),请压缩后重试",
        )

    scan_id = uuid.uuid4().hex
    start_time = time.time()

    def _process() -> dict:
        if is_pdf:
            return ocr_service.process_pdf(contents, db.IMAGES_DIR, scan_id)
        return ocr_service.process_image(contents, db.IMAGES_DIR, scan_id)

    try:
        # 放入线程池执行,避免阻塞事件循环;信号量控制并发为 1
        async with _ocr_semaphore:
            result = await asyncio.to_thread(_process)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"识别失败:{e}")

    record = db.create_scan({
        "id": scan_id,
        "title": filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "READY",
        "file_size": len(contents),
        "confidence": round(result["confidence"], 4),
        "processing_time": round(time.time() - start_time, 2),
        "extracted_text": result["extracted_text"],
        "segments": result["segments"],
        "image_file": result["image_file"],
        "thumb_file": result["thumb_file"],
        "image_width": result["image_width"],
        "image_height": result["image_height"],
        "page_count": result["page_count"],
    })
    return record


@app.get("/api/scans")
async def list_scans():
    return db.list_scans()


@app.get("/api/scans/{scan_id}")
async def get_scan(scan_id: str):
    record = db.get_scan(scan_id, with_segments=True)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@app.patch("/api/scans/{scan_id}")
async def update_scan(scan_id: str, payload: TextUpdate):
    record = db.update_scan_text(scan_id, payload.extracted_text)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@app.delete("/api/scans/{scan_id}")
async def delete_scan(scan_id: str):
    if not db.delete_scan(scan_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}


# 识别图片静态服务(必须在前端静态目录之前挂载)
app.mount("/api/images", StaticFiles(directory=db.IMAGES_DIR), name="images")

# 前端构建产物(Docker 镜像中位于 /app/static)
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
