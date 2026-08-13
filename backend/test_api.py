"""端到端冒烟测试:异步上传 → 轮询进度 → 历史 → 编辑 → 重试 → 导出 → 删除。

用法:先启动后端(uvicorn main:app),再运行 python test_api.py [BASE_URL]
默认 BASE_URL 为 http://localhost:8000
"""
import io
import os
import sys
import time

import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
FONT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "fonts",
    "NotoSansSC-Regular-subset.ttf",
)

PASSED = []
FAILED = []


def check(name: str, condition: bool, detail: str = ""):
    if condition:
        PASSED.append(name)
        print(f"[通过] {name}")
    else:
        FAILED.append(name)
        print(f"[失败] {name} {detail}")


def make_test_image() -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (760, 240), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT_PATH, 44)
    except OSError:
        font = ImageFont.load_default()
    draw.text((30, 30), "内网文字识别系统测试", fill=(0, 0, 0), font=font)
    draw.text((30, 120), "Hello OCR 12345", fill=(0, 0, 0), font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_test_pdf() -> bytes:
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz

    doc = fitz.open()
    page = doc.new_page()
    if os.path.exists(FONT_PATH):
        page.insert_font(fontname="noto", fontfile=FONT_PATH)
        page.insert_text((72, 100), "这是一份PDF文字层测试文档", fontname="noto", fontsize=18)
    page.insert_text((72, 140), "PDF text layer extraction test 678", fontsize=14)
    data = doc.tobytes()
    doc.close()
    return data


def wait_ready(scan_id: str, timeout: float = 180) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=15)
        if r.status_code == 200:
            last = r.json()
            status = last.get("status")
            if status == "READY":
                return last
            if status == "ERROR":
                raise RuntimeError(last.get("error_message") or "识别失败")
        time.sleep(0.4)
    raise TimeoutError(f"等待识别超时: {last}")


def main():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    body = r.json() if r.status_code == 200 else {}
    check("健康检查", r.status_code == 200 and body.get("model_loaded") is True, r.text)
    check("健康检查含线程数", int(body.get("threads") or 0) >= 1, str(body))

    img_bytes = make_test_image()
    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("测试图片.png", img_bytes, "image/png")},
        timeout=60,
    )
    check("图片上传立即返回", r.status_code == 200, r.text[:300])
    posted = r.json() if r.status_code == 200 else {}
    scan_id = posted.get("id", "")
    check("初始状态为处理中或已完成", posted.get("status") in ("PROCESSING", "READY"), str(posted.get("status")))

    try:
        scan = posted if posted.get("status") == "READY" else wait_ready(scan_id)
    except Exception as e:
        check("轮询直到完成", False, str(e))
        scan = {}
    else:
        check("轮询直到完成", scan.get("status") == "READY")

    text = scan.get("extracted_text", "")
    check("识别出中文", "文字识别" in text or "内网" in text, f"实际文本: {text!r}")
    check("识别出数字", "12345" in text, f"实际文本: {text!r}")
    check("返回置信度", 0 < scan.get("confidence", 0) <= 1)
    segs = scan.get("segments") or []
    check("返回文字框坐标", bool(segs) and segs[0].get("box"))
    check("分段含稳定 id", bool(segs) and bool(segs[0].get("id")))
    check("返回图片尺寸", scan.get("image_width", 0) > 0 and scan.get("image_height", 0) > 0)
    check("含 pages 分页信息", isinstance(scan.get("pages"), list) and len(scan.get("pages") or []) >= 1)

    for key in ("image_url", "thumb_url"):
        url = scan.get(key, "")
        rr = requests.get(f"{BASE_URL}{url}", timeout=10) if url else None
        check(f"{key} 可访问", rr is not None and rr.status_code == 200 and len(rr.content) > 100)

    r = requests.get(f"{BASE_URL}/api/scans", timeout=10)
    listing = r.json() if r.status_code == 200 else []
    item = next((s for s in listing if s.get("id") == scan_id), None)
    check("历史列表包含新记录", item is not None)
    check("列表不含全文", item is not None and "extracted_text" not in item)
    check("列表含预览摘要", item is not None and "text_preview" in item)

    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("详情接口含 segments", r.status_code == 200 and isinstance(r.json().get("segments"), list))

    new_text = "人工修改后的文本内容"
    r = requests.patch(f"{BASE_URL}/api/scans/{scan_id}", json={"extracted_text": new_text}, timeout=10)
    check("保存编辑", r.status_code == 200)
    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("编辑已持久化", r.json().get("extracted_text") == new_text)

    r = requests.post(
        f"{BASE_URL}/api/scans/{scan_id}/reflow",
        json={"layout_mode": "single", "ignore_header": 0, "ignore_footer": 0},
        timeout=15,
    )
    check("切换排版模式", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        check("排版后恢复识别文本", "12345" in r.json().get("extracted_text", "") or "文字" in r.json().get("extracted_text", ""))

    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}/export.pdf", timeout=30)
    check("导出可检索 PDF", r.status_code == 200 and r.content[:4] == b"%PDF", f"status={r.status_code}")

    r = requests.post(f"{BASE_URL}/api/scans/{scan_id}/retry", timeout=30)
    check("重新识别接口", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        try:
            retried = wait_ready(scan_id)
            check("重试后识别完成", retried.get("status") == "READY" and "12345" in retried.get("extracted_text", ""))
        except Exception as e:
            check("重试后识别完成", False, str(e))

    try:
        pdf_bytes = make_test_pdf()
        r = requests.post(
            f"{BASE_URL}/api/ocr",
            files={"file": ("测试文档.pdf", pdf_bytes, "application/pdf")},
            timeout=60,
        )
        check("PDF 上传立即返回", r.status_code == 200, r.text[:300])
        pdf_id = r.json().get("id") if r.status_code == 200 else ""
        try:
            pdf_scan = wait_ready(pdf_id) if pdf_id else {}
            check("PDF 文本层提取", "PDF" in pdf_scan.get("extracted_text", ""),
                  f"实际文本: {pdf_scan.get('extracted_text', '')!r}")
            check("PDF 含页进度字段", pdf_scan.get("page_done", 0) >= 1)
        finally:
            if pdf_id:
                requests.delete(f"{BASE_URL}/api/scans/{pdf_id}", timeout=10)
    except ImportError:
        print("[跳过] 本机未安装 pymupdf,跳过 PDF 用例")

    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("big.png", b"0" * (21 * 1024 * 1024), "image/png")},
        timeout=60,
    )
    check("超大文件被拒绝(413)", r.status_code == 413, f"status={r.status_code}")

    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("a.txt", b"hello", "text/plain")},
        timeout=10,
    )
    check("非法类型被拒绝(400)", r.status_code == 400, f"status={r.status_code}")

    r = requests.delete(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("删除记录", r.status_code == 200)
    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("删除后查询返回 404", r.status_code == 404)

    print(f"\n结果:{len(PASSED)} 项通过,{len(FAILED)} 项失败")
    if FAILED:
        print("失败项:", ", ".join(FAILED))
        sys.exit(1)


if __name__ == "__main__":
    main()
