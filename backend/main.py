"""OpticText OCR 后端服务。

- POST /api/ocr                 上传后立即返回,后台识别
- POST /api/scans/{id}/retry    用原件重新识别
- POST /api/scans/{id}/reflow   按排版模式/忽略带重算文本(不跑模型)
- GET  /api/scans/{id}/export.pdf  双层可检索 PDF
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from . import db
    from . import layout
    from .export_pdf import build_searchable_pdf
    from .ocr import OCRProcessor, apply_thread_limits
except ImportError:
    import db
    import layout
    from export_pdf import build_searchable_pdf
    from ocr import OCRProcessor, apply_thread_limits

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_ocr_semaphore = asyncio.Semaphore(1)
_thread_count = apply_thread_limits()

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
    ocr_service = OCRProcessor(num_threads=_thread_count)
except Exception as e:
    print(f"OCR 引擎初始化失败: {e}")
    ocr_service = None


class TextUpdate(BaseModel):
    extracted_text: str


class ReflowBody(BaseModel):
    layout_mode: Optional[str] = None
    ignore_header: Optional[float] = None
    ignore_footer: Optional[float] = None


def _original_ext(filename: str, is_pdf: bool) -> str:
    if is_pdf:
        return ".pdf"
    ext = os.path.splitext(filename)[1].lower()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"}:
        return ".jpg" if ext == ".jpeg" else ext
    return ".bin"


def _save_original(scan_id: str, contents: bytes, filename: str, is_pdf: bool) -> str:
    os.makedirs(db.ORIGINALS_DIR, exist_ok=True)
    stored = f"{scan_id}{_original_ext(filename, is_pdf)}"
    path = os.path.join(db.ORIGINALS_DIR, stored)
    with open(path, "wb") as fh:
        fh.write(contents)
    return stored


def _parse_ignore(value: Optional[str], default: float) -> float:
    if value is None or value == "":
        return default
    try:
        return max(0.0, min(0.4, float(value)))
    except ValueError:
        return default


async def _run_ocr_job(scan_id: str, is_pdf: bool) -> None:
    if not ocr_service:
        db.update_scan_fields(scan_id, status="ERROR", error_message="OCR 引擎未就绪")
        return

    record = db.get_scan(scan_id, with_segments=False)
    if record is None:
        return

    original_name = record.get("original_file") or ""
    original_path = os.path.join(db.ORIGINALS_DIR, original_name)
    if not original_name or not os.path.isfile(original_path):
        db.update_scan_fields(scan_id, status="ERROR", error_message="找不到上传原件,无法识别")
        return

    layout_mode = record.get("layout_mode") or layout.DEFAULT_LAYOUT
    ignore_header = float(record.get("ignore_header") or 0)
    ignore_footer = float(record.get("ignore_footer") or 0)
    start_time = time.time()

    def on_progress(done: int, total: int, page: dict) -> None:
        fields = {
            "page_done": done,
            "page_count": total,
        }
        if done == 1:
            fields.update({
                "image_file": page.get("image_file") or "",
                "image_width": page.get("width") or 0,
                "image_height": page.get("height") or 0,
            })
            thumb = f"{scan_id}_thumb.jpg"
            thumb_path = os.path.join(db.IMAGES_DIR, thumb)
            if os.path.isfile(thumb_path) or page.get("image_file"):
                # 缩略图在整份结束后写入;进度阶段先用首页预览
                fields["thumb_file"] = record.get("thumb_file") or ""
        db.update_scan_fields(scan_id, **fields)

    def work() -> dict:
        with open(original_path, "rb") as fh:
            contents = fh.read()
        if is_pdf:
            return ocr_service.process_pdf(
                contents, db.IMAGES_DIR, scan_id,
                layout_mode=layout_mode,
                ignore_header=ignore_header,
                ignore_footer=ignore_footer,
                on_progress=on_progress,
            )
        return ocr_service.process_image(
            contents, db.IMAGES_DIR, scan_id,
            layout_mode=layout_mode,
            ignore_header=ignore_header,
            ignore_footer=ignore_footer,
            on_progress=on_progress,
        )

    try:
        async with _ocr_semaphore:
            result = await asyncio.to_thread(work)
    except ValueError as ve:
        db.update_scan_fields(scan_id, status="ERROR", error_message=str(ve))
        return
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.update_scan_fields(scan_id, status="ERROR", error_message=f"识别失败:{e}")
        return

    db.update_scan_fields(
        scan_id,
        status="READY",
        error_message="",
        confidence=round(result["confidence"], 4),
        processing_time=round(time.time() - start_time, 2),
        extracted_text=result["extracted_text"],
        segments=result["segments"],
        pages=result["pages"],
        image_file=result["image_file"],
        thumb_file=result["thumb_file"],
        image_width=result["image_width"],
        image_height=result["image_height"],
        page_count=result["page_count"],
        page_done=result.get("page_done") or result["page_count"],
    )


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "model_loaded": ocr_service is not None,
        "threads": _thread_count,
    }


@app.post("/api/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    layout_mode: Optional[str] = Form(None),
    ignore_header: Optional[str] = Form(None),
    ignore_footer: Optional[str] = Form(None),
):
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

    mode = layout_mode if layout_mode in layout.LAYOUT_MODES else layout.DEFAULT_LAYOUT
    header = _parse_ignore(ignore_header, layout.DEFAULT_IGNORE)
    footer = _parse_ignore(ignore_footer, layout.DEFAULT_IGNORE)

    scan_id = uuid.uuid4().hex
    original_file = _save_original(scan_id, contents, filename, is_pdf)
    record = db.create_scan({
        "id": scan_id,
        "title": filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "PROCESSING",
        "file_size": len(contents),
        "original_file": original_file,
        "layout_mode": mode,
        "ignore_header": header,
        "ignore_footer": footer,
        "page_count": 1,
        "page_done": 0,
        "extracted_text": "正在识别中…",
    })
    asyncio.create_task(_run_ocr_job(scan_id, is_pdf))
    return record


@app.post("/api/scans/{scan_id}/retry")
async def retry_scan(scan_id: str):
    if not ocr_service:
        raise HTTPException(status_code=503, detail="OCR 引擎未就绪,请检查服务日志")
    record = db.get_scan(scan_id, with_segments=False)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    original = record.get("original_file") or ""
    path = os.path.join(db.ORIGINALS_DIR, original) if original else ""
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="没有保存原件,无法重新识别")

    is_pdf = original.lower().endswith(".pdf")
    updated = db.update_scan_fields(
        scan_id,
        status="PROCESSING",
        error_message="",
        page_done=0,
        extracted_text="正在重新识别…",
        processing_time=0,
    )
    asyncio.create_task(_run_ocr_job(scan_id, is_pdf))
    return updated


@app.post("/api/scans/{scan_id}/reflow")
async def reflow_scan(scan_id: str, payload: ReflowBody):
    record = db.get_scan(scan_id, with_segments=True)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    mode = payload.layout_mode if payload.layout_mode in layout.LAYOUT_MODES else record.get("layout_mode")
    header = layout.DEFAULT_IGNORE if payload.ignore_header is None else max(0.0, min(0.4, payload.ignore_header))
    footer = layout.DEFAULT_IGNORE if payload.ignore_footer is None else max(0.0, min(0.4, payload.ignore_footer))
    pages = record.get("pages") or []
    if not pages and record.get("segments"):
        pages = [{
            "index": 0,
            "segments": record["segments"],
            "height": record.get("image_height") or 0,
            "width": record.get("image_width") or 0,
            "image_file": record.get("image_file") or "",
        }]
    text = layout.reflow_pages(pages, mode, header, footer)
    return db.update_scan_fields(
        scan_id,
        extracted_text=text,
        layout_mode=mode,
        ignore_header=header,
        ignore_footer=footer,
    )


@app.get("/api/scans")
async def list_scans(q: Optional[str] = None):
    return db.list_scans(q)


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


@app.get("/api/scans/{scan_id}/export.pdf")
async def export_pdf(scan_id: str):
    record = db.get_scan(scan_id, with_segments=True)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.get("status") != "READY":
        raise HTTPException(status_code=409, detail="识别尚未完成,无法导出 PDF")
    try:
        pdf_bytes = build_searchable_pdf(record, db.IMAGES_DIR, db.ORIGINALS_DIR)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出 PDF 失败:{e}")
    base = os.path.splitext(record.get("title") or "识别结果")[0] or "识别结果"
    filename = quote(f"{base}_可检索.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=export.pdf; filename*=UTF-8''{filename}",
        },
    )


app.mount("/api/images", StaticFiles(directory=db.IMAGES_DIR), name="images")

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
