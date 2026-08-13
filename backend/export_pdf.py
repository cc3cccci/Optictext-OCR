"""生成双层可检索 PDF:原图/原 PDF + 按识别框写入的不可见文字层。"""
import os
from typing import Dict, List

PDF_RENDER_DPI = 150


def _import_pymupdf():
    try:
        import pymupdf
        return pymupdf
    except ImportError:
        import fitz
        return fitz


def _safe_text(value: str) -> str:
    return (value or "").replace("\x00", "")


def _insert_invisible(page, box: List[int], text: str, zoom: float) -> None:
    text = _safe_text(text).strip()
    if not text or not box or len(box) < 4:
        return
    x0, y0, x1, y1 = [c / zoom for c in box]
    height = max(4.0, y1 - y0)
    fontsize = max(6.0, min(height * 0.85, 48.0))
    try:
        page.insert_text(
            (x0, y0 + fontsize * 0.85),
            text,
            fontsize=fontsize,
            render_mode=3,
        )
    except Exception:
        pass


def build_searchable_pdf(
    record: Dict,
    images_dir: str,
    originals_dir: str,
) -> bytes:
    fitz = _import_pymupdf()
    pages: List[Dict] = record.get("pages") or []
    original_file = record.get("original_file") or ""
    original_path = os.path.join(originals_dir, original_file) if original_file else ""
    is_pdf = original_file.lower().endswith(".pdf") and os.path.isfile(original_path)
    zoom = PDF_RENDER_DPI / 72.0

    if is_pdf:
        doc = fitz.open(original_path)
        try:
            for page_info in pages:
                idx = int(page_info.get("index") or 0)
                if idx < 0 or idx >= doc.page_count:
                    continue
                page = doc.load_page(idx)
                for seg in page_info.get("segments") or []:
                    if seg.get("box"):
                        _insert_invisible(page, seg["box"], seg.get("text") or "", zoom)
            return doc.tobytes()
        finally:
            doc.close()

    doc = fitz.open()
    try:
        sources = pages if pages else [{
            "image_file": record.get("image_file"),
            "width": record.get("image_width") or 0,
            "height": record.get("image_height") or 0,
            "segments": record.get("segments") or [],
        }]
        for page_info in sources:
            image_file = page_info.get("image_file") or record.get("image_file")
            image_path = os.path.join(images_dir, image_file) if image_file else ""
            width = float(page_info.get("width") or record.get("image_width") or 595)
            height = float(page_info.get("height") or record.get("image_height") or 842)
            page = doc.new_page(width=width, height=height)
            if image_path and os.path.isfile(image_path):
                page.insert_image(page.rect, filename=image_path)
            for seg in page_info.get("segments") or []:
                if seg.get("box"):
                    _insert_invisible(page, seg["box"], seg.get("text") or "", 1.0)
        if doc.page_count == 0:
            page = doc.new_page()
            page.insert_text((72, 72), _safe_text(record.get("extracted_text") or "(无文本)"))
        return doc.tobytes()
    finally:
        doc.close()
