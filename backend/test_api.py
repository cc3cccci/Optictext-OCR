"""端到端冒烟测试:上传 → 识别 → 历史 → 编辑 → 删除 全链路验证。

用法:先启动后端(uvicorn main:app),再运行 python test_api.py [BASE_URL]
默认 BASE_URL 为 http://localhost:8000
"""
import io
import os
import sys

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
    """生成含中英文的测试图片。"""
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
    """生成含文本层的测试 PDF(验证文本层直提路径)。"""
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


def main():
    # 1. 健康检查
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    check("健康检查", r.status_code == 200 and r.json().get("model_loaded") is True, r.text)

    # 2. 图片 OCR
    img_bytes = make_test_image()
    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("测试图片.png", img_bytes, "image/png")},
        timeout=180,
    )
    check("图片识别请求", r.status_code == 200, r.text[:300])
    scan = r.json() if r.status_code == 200 else {}
    scan_id = scan.get("id", "")
    text = scan.get("extracted_text", "")
    check("识别出中文", "文字识别" in text or "内网" in text, f"实际文本: {text!r}")
    check("识别出数字", "12345" in text, f"实际文本: {text!r}")
    check("返回置信度", 0 < scan.get("confidence", 0) <= 1)
    check("返回文字框坐标", bool(scan.get("segments")) and scan["segments"][0].get("box"))
    check("返回图片尺寸", scan.get("image_width", 0) > 0 and scan.get("image_height", 0) > 0)

    # 3. 预览图与缩略图可访问
    for key in ("image_url", "thumb_url"):
        url = scan.get(key, "")
        rr = requests.get(f"{BASE_URL}{url}", timeout=10) if url else None
        check(f"{key} 可访问", rr is not None and rr.status_code == 200 and len(rr.content) > 100)

    # 4. 历史列表
    r = requests.get(f"{BASE_URL}/api/scans", timeout=10)
    check("历史列表包含新记录", r.status_code == 200 and any(s["id"] == scan_id for s in r.json()))

    # 5. 详情(含 segments)
    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("详情接口含 segments", r.status_code == 200 and isinstance(r.json().get("segments"), list))

    # 6. 编辑保存
    new_text = "人工修改后的文本内容"
    r = requests.patch(f"{BASE_URL}/api/scans/{scan_id}", json={"extracted_text": new_text}, timeout=10)
    check("保存编辑", r.status_code == 200)
    r = requests.get(f"{BASE_URL}/api/scans/{scan_id}", timeout=10)
    check("编辑已持久化", r.json().get("extracted_text") == new_text)

    # 7. PDF 识别(文本层)
    try:
        pdf_bytes = make_test_pdf()
        r = requests.post(
            f"{BASE_URL}/api/ocr",
            files={"file": ("测试文档.pdf", pdf_bytes, "application/pdf")},
            timeout=180,
        )
        check("PDF 识别请求", r.status_code == 200, r.text[:300])
        pdf_scan = r.json() if r.status_code == 200 else {}
        check("PDF 文本层提取", "PDF" in pdf_scan.get("extracted_text", ""),
              f"实际文本: {pdf_scan.get('extracted_text', '')!r}")
        if pdf_scan.get("id"):
            requests.delete(f"{BASE_URL}/api/scans/{pdf_scan['id']}", timeout=10)
    except ImportError:
        print("[跳过] 本机未安装 pymupdf,跳过 PDF 用例")

    # 8. 大小限制
    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("big.png", b"0" * (21 * 1024 * 1024), "image/png")},
        timeout=60,
    )
    check("超大文件被拒绝(413)", r.status_code == 413, f"status={r.status_code}")

    # 9. 非法类型
    r = requests.post(
        f"{BASE_URL}/api/ocr",
        files={"file": ("a.txt", b"hello", "text/plain")},
        timeout=10,
    )
    check("非法类型被拒绝(400)", r.status_code == 400, f"status={r.status_code}")

    # 10. 删除
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
