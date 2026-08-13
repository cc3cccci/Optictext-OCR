"""OCR 处理核心。

- 图片:PIL 读取并做 EXIF 方向矫正后交给 RapidOCR,返回文本、置信度与文字框坐标。
- PDF:PyMuPDF 逐页处理;含文本层的页面直接提取(快且无损),
  扫描页渲染成图片后走 OCR。预览图与文字框对应第一页。
- 识别结果统一附带预览图/缩略图文件,供历史记录持久化使用。
"""
import io
import os
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

# PDF 渲染参数
PDF_RENDER_DPI = 150
PDF_MAX_PAGES = 10
# 页面文本层长度达到该值则认为是文字版 PDF,直接提取无需 OCR
PDF_TEXT_LAYER_MIN_CHARS = 10

# 预览图/缩略图参数
PREVIEW_MAX_SIDE = 2600
PREVIEW_JPEG_QUALITY = 90
THUMB_WIDTH = 320
THUMB_JPEG_QUALITY = 80


class OCRProcessor:
    def __init__(self):
        # RapidOCR 默认加载内置 PP-OCRv4 mobile 模型(中英混合),
        # 适合 Armbian 这类 CPU 受限设备。
        self.ocr_engine = RapidOCR()

    # ---------- 公共入口 ----------

    def process_image(self, image_content: bytes, images_dir: str, basename: str) -> dict:
        """处理图片字节流,返回识别结果与落盘的预览图/缩略图文件名。"""
        img_bgr = self._decode_image(image_content)
        if img_bgr is None:
            raise ValueError("无法解析图片文件,请确认文件未损坏")

        img_bgr = self._limit_size(img_bgr)
        text, confidence, segments = self._run_ocr(img_bgr)

        height, width = img_bgr.shape[:2]
        image_file, thumb_file = self._save_preview(img_bgr, images_dir, basename)

        return {
            "extracted_text": text,
            "confidence": confidence,
            "segments": segments,
            "image_file": image_file,
            "thumb_file": thumb_file,
            "image_width": width,
            "image_height": height,
            "page_count": 1,
        }

    def process_pdf(self, pdf_content: bytes, images_dir: str, basename: str) -> dict:
        """逐页处理 PDF:文本层优先,扫描页走 OCR;预览图取第一页。"""
        import fitz  # PyMuPDF,延迟导入以便无该依赖时图片功能仍可用

        try:
            doc = fitz.open(stream=pdf_content, filetype="pdf")
        except Exception:
            raise ValueError("无法解析 PDF 文件,请确认文件未损坏")

        try:
            total_pages = doc.page_count
            if total_pages == 0:
                raise ValueError("PDF 文件不含任何页面")
            pages_to_process = min(total_pages, PDF_MAX_PAGES)
            zoom = PDF_RENDER_DPI / 72.0

            page_texts: List[str] = []
            ocr_confidences: List[float] = []
            first_page_segments: List[dict] = []
            first_page_img: Optional[np.ndarray] = None

            for page_index in range(pages_to_process):
                page = doc.load_page(page_index)
                need_preview = page_index == 0

                text_layer = page.get_text().strip()
                if len(text_layer) >= PDF_TEXT_LAYER_MIN_CHARS:
                    # 文字版页面:直接提取,精确且极快
                    page_texts.append(text_layer)
                    if need_preview:
                        first_page_img = self._render_page(page, zoom)
                        first_page_segments = self._words_to_segments(page, zoom)
                else:
                    # 扫描版页面:渲染成图片后 OCR
                    img_bgr = self._render_page(page, zoom)
                    text, confidence, segments = self._run_ocr(img_bgr)
                    page_texts.append(text)
                    if text:
                        ocr_confidences.append(confidence)
                    if need_preview:
                        first_page_img = img_bgr
                        first_page_segments = segments

            full_text = self._join_pages(page_texts, total_pages, pages_to_process)
            confidence = (
                sum(ocr_confidences) / len(ocr_confidences) if ocr_confidences else 1.0
            )

            assert first_page_img is not None
            height, width = first_page_img.shape[:2]
            image_file, thumb_file = self._save_preview(first_page_img, images_dir, basename)

            return {
                "extracted_text": full_text,
                "confidence": confidence,
                "segments": first_page_segments,
                "image_file": image_file,
                "thumb_file": thumb_file,
                "image_width": width,
                "image_height": height,
                "page_count": total_pages,
            }
        finally:
            doc.close()

    # ---------- 内部工具 ----------

    def _decode_image(self, content: bytes) -> Optional[np.ndarray]:
        """解码图片并做 EXIF 方向矫正(手机竖拍照片),输出 BGR ndarray。"""
        try:
            pil_img = Image.open(io.BytesIO(content))
            pil_img = ImageOps.exif_transpose(pil_img)
            pil_img = pil_img.convert("RGB")
            return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            # PIL 不支持的格式退回 OpenCV 解码(无 EXIF 处理)
            nparr = np.frombuffer(content, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    def _limit_size(self, img: np.ndarray) -> np.ndarray:
        """限制最长边,避免超大图在弱设备上撑爆内存。"""
        h, w = img.shape[:2]
        longest = max(h, w)
        if longest <= PREVIEW_MAX_SIDE:
            return img
        scale = PREVIEW_MAX_SIDE / longest
        return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    def _run_ocr(self, img_bgr: np.ndarray) -> Tuple[str, float, List[dict]]:
        """执行 OCR,返回 (整体文本, 平均置信度, 分段结果含外接矩形坐标)。"""
        result, _elapse = self.ocr_engine(img_bgr)
        if not result:
            return "", 0.0, []

        lines: List[str] = []
        segments: List[dict] = []
        total_confidence = 0.0

        for box, text, conf in result:
            lines.append(text)
            total_confidence += float(conf)
            segments.append({
                "text": text,
                "confidence": round(float(conf), 4),
                "box": self._bounding_rect(box),
            })

        return "\n".join(lines), total_confidence / len(result), segments

    @staticmethod
    def _bounding_rect(box) -> List[int]:
        """四点多边形 -> 外接矩形 [x0, y0, x1, y1](像素坐标)。"""
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        return [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]

    @staticmethod
    def _render_page(page, zoom: float) -> np.ndarray:
        import fitz

        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 3:
            return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        if pix.n == 1:
            return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        return cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)

    @staticmethod
    def _words_to_segments(page, zoom: float) -> List[dict]:
        """文字版 PDF 的词级 bbox(PDF 点坐标)换算为渲染图像素坐标。"""
        segments: List[dict] = []
        try:
            words = page.get_text("words")
        except Exception:
            return segments
        for w in words:
            x0, y0, x1, y1, word = w[0], w[1], w[2], w[3], w[4]
            segments.append({
                "text": word,
                "confidence": 1.0,
                "box": [int(x0 * zoom), int(y0 * zoom), int(x1 * zoom), int(y1 * zoom)],
            })
        return segments

    @staticmethod
    def _join_pages(page_texts: List[str], total_pages: int, processed_pages: int) -> str:
        if len(page_texts) == 1 and total_pages == 1:
            return page_texts[0]
        parts = []
        for i, text in enumerate(page_texts, start=1):
            parts.append(f"—— 第 {i} 页 ——\n{text}")
        joined = "\n\n".join(parts)
        if total_pages > processed_pages:
            joined += f"\n\n(共 {total_pages} 页,已识别前 {processed_pages} 页)"
        return joined

    @staticmethod
    def _save_preview(img_bgr: np.ndarray, images_dir: str, basename: str) -> Tuple[str, str]:
        """保存预览大图与缩略图(JPEG),返回文件名。

        预览图为方向矫正后的像素,与文字框坐标严格一致。
        """
        os.makedirs(images_dir, exist_ok=True)
        image_file = f"{basename}.jpg"
        thumb_file = f"{basename}_thumb.jpg"

        cv2.imwrite(
            os.path.join(images_dir, image_file),
            img_bgr,
            [cv2.IMWRITE_JPEG_QUALITY, PREVIEW_JPEG_QUALITY],
        )

        h, w = img_bgr.shape[:2]
        if w > THUMB_WIDTH:
            scale = THUMB_WIDTH / w
            thumb = cv2.resize(img_bgr, (THUMB_WIDTH, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
        else:
            thumb = img_bgr
        cv2.imwrite(
            os.path.join(images_dir, thumb_file),
            thumb,
            [cv2.IMWRITE_JPEG_QUALITY, THUMB_JPEG_QUALITY],
        )
        return image_file, thumb_file
