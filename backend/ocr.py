"""OCR 处理核心。

- 图片:EXIF 矫正 + CLAHE 增强后交给 RapidOCR。
- PDF:文本层优先,扫描页逐页 OCR;每一页都保存预览图。
- 线程数受环境变量限制,避免在 Armbian 上把 CPU 打满。
"""
import io
import os
from typing import Callable, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

try:
    from . import layout
except ImportError:
    import layout

PDF_RENDER_DPI = 150
PDF_MAX_PAGES = 10
PDF_TEXT_LAYER_MIN_CHARS = 10

PREVIEW_MAX_SIDE = 2600
PREVIEW_JPEG_QUALITY = 90
THUMB_WIDTH = 320
THUMB_JPEG_QUALITY = 80

ProgressCb = Callable[[int, int, dict], None]


def _thread_count() -> int:
    raw = os.environ.get("ORT_INTRA_OP") or os.environ.get("OMP_NUM_THREADS") or "2"
    try:
        return max(1, min(8, int(raw)))
    except ValueError:
        return 2


def apply_thread_limits(num_threads: Optional[int] = None) -> int:
    """限制 OpenMP / OpenCV 线程,须在创建推理会话之前调用。"""
    n = num_threads if num_threads is not None else _thread_count()
    os.environ.setdefault("OMP_NUM_THREADS", str(n))
    os.environ.setdefault("MKL_NUM_THREADS", str(n))
    os.environ.setdefault("OPENBLAS_NUM_THREADS", str(n))
    os.environ.setdefault("NUMEXPR_NUM_THREADS", str(n))
    try:
        cv2.setNumThreads(n)
    except Exception:
        pass
    return n


def _import_pymupdf():
    try:
        import pymupdf
        return pymupdf
    except ImportError:
        import fitz
        return fitz


class OCRProcessor:
    def __init__(self, num_threads: Optional[int] = None):
        self.num_threads = apply_thread_limits(num_threads)
        self.ocr_engine = self._init_engine(self.num_threads)
        self._warmup()

    @staticmethod
    def _init_engine(num_threads: int) -> RapidOCR:
        # RapidOCR 1.3.x 将未知 kwargs 写入 Global 配置;intra_op 会传到 ORT Session。
        try:
            return RapidOCR(intra_op_num_threads=num_threads, inter_op_num_threads=1)
        except Exception:
            return RapidOCR()

    def _warmup(self) -> None:
        """用小图跑通检测/识别,避免首张真实请求额外等待加载。"""
        try:
            dummy = np.full((32, 32, 3), 255, dtype=np.uint8)
            self.ocr_engine(dummy)
        except Exception as exc:
            print(f"OCR warmup skipped: {exc}")

    # ---------- 公共入口 ----------

    def process_image(
        self,
        image_content: bytes,
        images_dir: str,
        basename: str,
        layout_mode: str = layout.DEFAULT_LAYOUT,
        ignore_header: float = layout.DEFAULT_IGNORE,
        ignore_footer: float = layout.DEFAULT_IGNORE,
        on_progress: Optional[ProgressCb] = None,
    ) -> dict:
        img_bgr = self._decode_image(image_content)
        if img_bgr is None:
            raise ValueError("无法解析图片文件,请确认文件未损坏")

        img_bgr = self._limit_size(img_bgr)
        page = self._ocr_page(
            img_bgr, images_dir, basename, 0, layout_mode, ignore_header, ignore_footer
        )
        if on_progress:
            on_progress(1, 1, page)

        return self._pack_result([page], 1, 1, images_dir, basename)

    def process_pdf(
        self,
        pdf_content: bytes,
        images_dir: str,
        basename: str,
        layout_mode: str = layout.DEFAULT_LAYOUT,
        ignore_header: float = layout.DEFAULT_IGNORE,
        ignore_footer: float = layout.DEFAULT_IGNORE,
        on_progress: Optional[ProgressCb] = None,
    ) -> dict:
        fitz = _import_pymupdf()
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
            pages: List[dict] = []

            for page_index in range(pages_to_process):
                page = doc.load_page(page_index)
                text_layer = page.get_text().strip()
                img_bgr = self._render_page(page, zoom)
                if len(text_layer) >= PDF_TEXT_LAYER_MIN_CHARS:
                    segments = self._words_to_line_segments(page, zoom, page_index)
                    height, width = img_bgr.shape[:2]
                    text, ordered = layout.layout_text(
                        segments, height, layout_mode, ignore_header, ignore_footer
                    )
                    image_file = self._save_page_image(img_bgr, images_dir, basename, page_index)
                    page_info = {
                        "index": page_index,
                        "image_file": image_file,
                        "width": width,
                        "height": height,
                        "segments": ordered,
                        "text": text,
                        "confidence": 1.0,
                    }
                else:
                    page_info = self._ocr_page(
                        img_bgr, images_dir, basename, page_index,
                        layout_mode, ignore_header, ignore_footer,
                    )
                pages.append(page_info)
                if on_progress:
                    on_progress(page_index + 1, total_pages, page_info)

            return self._pack_result(pages, total_pages, pages_to_process, images_dir, basename)
        finally:
            doc.close()

    def _pack_result(
        self,
        pages: List[dict],
        total_pages: int,
        processed_pages: int,
        images_dir: str,
        basename: str,
    ) -> dict:
        first = pages[0]
        thumb_file = self._save_thumb(
            os.path.join(images_dir, first["image_file"]),
            images_dir,
            basename,
        )
        confidences = [p["confidence"] for p in pages if p.get("confidence")]
        texts = [p.get("text") or "" for p in pages]
        all_segments: List[dict] = []
        for p in pages:
            all_segments.extend(p.get("segments") or [])

        public_pages = [{
            "index": p["index"],
            "image_file": p["image_file"],
            "width": p["width"],
            "height": p["height"],
            "segments": p.get("segments") or [],
        } for p in pages]

        return {
            "extracted_text": layout.join_pages(texts, total_pages, processed_pages),
            "confidence": (sum(confidences) / len(confidences)) if confidences else 0.0,
            "segments": all_segments,
            "pages": public_pages,
            "image_file": first["image_file"],
            "thumb_file": thumb_file,
            "image_width": first["width"],
            "image_height": first["height"],
            "page_count": total_pages,
            "page_done": processed_pages,
        }

    def _ocr_page(
        self,
        img_bgr: np.ndarray,
        images_dir: str,
        basename: str,
        page_index: int,
        layout_mode: str,
        ignore_header: float,
        ignore_footer: float,
    ) -> dict:
        enhanced = self._enhance(img_bgr)
        text, confidence, segments = self._run_ocr(
            enhanced, page_index, img_bgr.shape[0], layout_mode, ignore_header, ignore_footer
        )
        height, width = img_bgr.shape[:2]
        image_file = self._save_page_image(img_bgr, images_dir, basename, page_index)
        return {
            "index": page_index,
            "image_file": image_file,
            "width": width,
            "height": height,
            "segments": segments,
            "text": text,
            "confidence": confidence,
        }

    # ---------- 图像 ----------

    def _decode_image(self, content: bytes) -> Optional[np.ndarray]:
        try:
            pil_img = Image.open(io.BytesIO(content))
            pil_img = ImageOps.exif_transpose(pil_img)
            pil_img = pil_img.convert("RGB")
            return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            nparr = np.frombuffer(content, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    def _limit_size(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        longest = max(h, w)
        if longest <= PREVIEW_MAX_SIDE:
            return img
        scale = PREVIEW_MAX_SIDE / longest
        return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    @staticmethod
    def _enhance(img_bgr: np.ndarray) -> np.ndarray:
        """CLAHE 提升拍照对比度,不改变几何尺寸(文字框仍对齐原图)。"""
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_ch = clahe.apply(l_ch)
        return cv2.cvtColor(cv2.merge([l_ch, a_ch, b_ch]), cv2.COLOR_LAB2BGR)

    def _run_ocr(
        self,
        img_bgr: np.ndarray,
        page_index: int,
        image_height: int,
        layout_mode: str,
        ignore_header: float,
        ignore_footer: float,
    ) -> Tuple[str, float, List[dict]]:
        result, _elapse = self.ocr_engine(img_bgr)
        if not result:
            return "", 0.0, []

        segments: List[dict] = []
        total_confidence = 0.0
        for box, text, conf in result:
            total_confidence += float(conf)
            segments.append({
                "text": text,
                "confidence": round(float(conf), 4),
                "box": self._bounding_rect(box),
                "page": page_index,
            })

        text, ordered = layout.layout_text(
            segments, image_height, layout_mode, ignore_header, ignore_footer
        )
        ordered = layout.assign_ids(ordered, page_index)
        avg = total_confidence / len(result) if result else 0.0
        return text, avg, ordered

    @staticmethod
    def _bounding_rect(box) -> List[int]:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        return [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]

    @staticmethod
    def _render_page(page, zoom: float) -> np.ndarray:
        fitz = _import_pymupdf()
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 3:
            return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        if pix.n == 1:
            return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        return cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)

    @staticmethod
    def _words_to_line_segments(page, zoom: float, page_index: int) -> List[dict]:
        """文字版 PDF:词级 bbox 聚成行,便于图文互链。"""
        try:
            words = page.get_text("words")
        except Exception:
            return []
        raw: List[dict] = []
        for w in words:
            x0, y0, x1, y1, word = w[0], w[1], w[2], w[3], w[4]
            raw.append({
                "text": word,
                "confidence": 1.0,
                "box": [int(x0 * zoom), int(y0 * zoom), int(x1 * zoom), int(y1 * zoom)],
                "page": page_index,
            })
        lines = layout.cluster_lines(raw)
        segments: List[dict] = []
        for line in lines:
            boxes = [layout._box(s) for s in line["items"]]
            boxes = [b for b in boxes if b]
            if not boxes:
                continue
            segments.append({
                "text": layout._line_text(line),
                "confidence": 1.0,
                "box": [
                    min(b[0] for b in boxes),
                    min(b[1] for b in boxes),
                    max(b[2] for b in boxes),
                    max(b[3] for b in boxes),
                ],
                "page": page_index,
            })
        return layout.assign_ids(segments, page_index)

    @staticmethod
    def _save_page_image(img_bgr: np.ndarray, images_dir: str, basename: str, page_index: int) -> str:
        os.makedirs(images_dir, exist_ok=True)
        image_file = f"{basename}_p{page_index}.jpg"
        cv2.imwrite(
            os.path.join(images_dir, image_file),
            img_bgr,
            [cv2.IMWRITE_JPEG_QUALITY, PREVIEW_JPEG_QUALITY],
        )
        return image_file

    @staticmethod
    def _save_thumb(page_path: str, images_dir: str, basename: str) -> str:
        img_bgr = cv2.imread(page_path)
        if img_bgr is None:
            return ""
        h, w = img_bgr.shape[:2]
        if w > THUMB_WIDTH:
            scale = THUMB_WIDTH / w
            thumb = cv2.resize(img_bgr, (THUMB_WIDTH, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
        else:
            thumb = img_bgr
        thumb_file = f"{basename}_thumb.jpg"
        cv2.imwrite(
            os.path.join(images_dir, thumb_file),
            thumb,
            [cv2.IMWRITE_JPEG_QUALITY, THUMB_JPEG_QUALITY],
        )
        return thumb_file
