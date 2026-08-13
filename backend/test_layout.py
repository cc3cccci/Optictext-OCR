"""排版与可检索 PDF 的纯函数测试,不依赖 OCR 引擎。"""
import io
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import layout
from export_pdf import build_searchable_pdf

PASSED = []
FAILED = []


def check(name: str, condition: bool, detail: str = ""):
    if condition:
        PASSED.append(name)
        print(f"[通过] {name}")
    else:
        FAILED.append(name)
        print(f"[失败] {name} {detail}")


def test_ignore_and_order():
    segs = [
        {"text": "页脚", "box": [10, 380, 80, 395], "confidence": 1},
        {"text": "右侧", "box": [200, 120, 280, 140], "confidence": 1},
        {"text": "页眉水印", "box": [10, 8, 120, 24], "confidence": 1},
        {"text": "左侧", "box": [20, 118, 90, 138], "confidence": 1},
        {"text": "第二行", "box": [20, 160, 100, 180], "confidence": 1},
    ]
    filtered = layout.filter_ignore(segs, 400, header=0.08, footer=0.08)
    texts = [s["text"] for s in filtered]
    check("忽略页眉", "页眉水印" not in texts)
    check("忽略页脚", "页脚" not in texts)
    check("保留正文", "左侧" in texts and "右侧" in texts and "第二行" in texts)

    ordered = layout.sort_reading_order(filtered)
    check("同行从左到右", [s["text"] for s in ordered[:2]] == ["左侧", "右侧"])

    text, _ = layout.layout_text(segs, 400, "raw", 0.08, 0.08)
    check("原文含换行", "\n" in text)
    single, _ = layout.layout_text(segs, 400, "single", 0.08, 0.08)
    check("单行无换行", "\n" not in single and "左侧" in single)


def test_paragraph_cjk():
    segs = [
        {"text": "今天天气", "box": [10, 10, 80, 28], "confidence": 1},
        {"text": "很好。", "box": [10, 32, 60, 50], "confidence": 1},
        {"text": "下一句", "box": [10, 90, 70, 108], "confidence": 1},
    ]
    text, _ = layout.layout_text(segs, 200, "paragraph", 0, 0)
    check("中文段内无空格", "今天天气很好。" in text.replace(" ", ""))
    check("句号后分段", "下一句" in text)


def test_searchable_pdf():
    from PIL import Image

    img = Image.new("RGB", (200, 80), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    with tempfile.TemporaryDirectory() as tmp:
        images = os.path.join(tmp, "images")
        originals = os.path.join(tmp, "originals")
        os.makedirs(images)
        os.makedirs(originals)
        path = os.path.join(images, "p0.jpg")
        with open(path, "wb") as fh:
            fh.write(buf.getvalue())
        record = {
            "title": "测试.pdf",
            "extracted_text": "Hello",
            "image_file": "p0.jpg",
            "image_width": 200,
            "image_height": 80,
            "original_file": "",
            "pages": [{
                "index": 0,
                "image_file": "p0.jpg",
                "width": 200,
                "height": 80,
                "segments": [{"text": "Hello", "box": [10, 20, 80, 40], "confidence": 1}],
            }],
        }
        data = build_searchable_pdf(record, images, originals)
        check("可检索 PDF 魔数", data[:4] == b"%PDF")
        check("可检索 PDF 非空", len(data) > 200)


def main():
    test_ignore_and_order()
    test_paragraph_cjk()
    try:
        test_searchable_pdf()
    except ImportError as e:
        print(f"[跳过] 可检索 PDF({e})")
    print(f"\n结果:{len(PASSED)} 项通过,{len(FAILED)} 项失败")
    if FAILED:
        print("失败项:", ", ".join(FAILED))
        sys.exit(1)


if __name__ == "__main__":
    main()
