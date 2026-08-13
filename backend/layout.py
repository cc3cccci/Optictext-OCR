"""识别框后处理:阅读顺序、忽略页眉页脚、排版模式(Umi-OCR tbpu 简化版)。

不依赖 OCR 引擎,可单独做单元测试。
"""
from typing import Dict, Iterable, List, Optional, Tuple

LayoutMode = str
LAYOUT_RAW = "raw"
LAYOUT_PARAGRAPH = "paragraph"
LAYOUT_SINGLE = "single"
LAYOUT_MODES = (LAYOUT_RAW, LAYOUT_PARAGRAPH, LAYOUT_SINGLE)
DEFAULT_LAYOUT = LAYOUT_PARAGRAPH
DEFAULT_IGNORE = 0.08

Segment = Dict


def _box(seg: Segment) -> Optional[List[int]]:
    box = seg.get("box")
    if not box or len(box) < 4:
        return None
    return [int(box[0]), int(box[1]), int(box[2]), int(box[3])]


def _center_y(box: List[int]) -> float:
    return (box[1] + box[3]) / 2.0


def _height(box: List[int]) -> int:
    return max(1, box[3] - box[1])


def filter_ignore(
    segments: Iterable[Segment],
    image_height: int,
    header: float = DEFAULT_IGNORE,
    footer: float = DEFAULT_IGNORE,
) -> List[Segment]:
    """去掉中心点落在页眉/页脚带内的整块文本(水印、页码)。"""
    segs = list(segments)
    if not image_height:
        return segs
    header = max(0.0, min(0.4, float(header or 0)))
    footer = max(0.0, min(0.4, float(footer or 0)))
    if header <= 0 and footer <= 0:
        return segs
    top = image_height * header
    bottom = image_height * (1.0 - footer)
    kept: List[Segment] = []
    for seg in segs:
        box = _box(seg)
        if box is None:
            kept.append(seg)
            continue
        cy = _center_y(box)
        if header > 0 and cy < top:
            continue
        if footer > 0 and cy > bottom:
            continue
        kept.append(seg)
    return kept


def cluster_lines(segments: Iterable[Segment]) -> List[Dict]:
    """按垂直重叠聚成行,行内按 x 排序。"""
    items = []
    no_box = []
    for seg in segments:
        box = _box(seg)
        if box is None:
            no_box.append(seg)
            continue
        items.append(seg)

    items.sort(key=lambda s: (_center_y(_box(s)), _box(s)[0]))

    lines: List[Dict] = []
    for seg in items:
        box = _box(seg)
        cy = _center_y(box)
        h = _height(box)
        placed = False
        for line in lines:
            if abs(cy - line["cy"]) < 0.55 * max(h, line["h"]):
                line["items"].append(seg)
                n = len(line["items"])
                line["cy"] = (line["cy"] * (n - 1) + cy) / n
                line["h"] = max(line["h"], h)
                line["y0"] = min(line["y0"], box[1])
                line["y1"] = max(line["y1"], box[3])
                line["x0"] = min(line["x0"], box[0])
                placed = True
                break
        if not placed:
            lines.append({
                "items": [seg],
                "cy": cy,
                "h": h,
                "y0": box[1],
                "y1": box[3],
                "x0": box[0],
            })

    for line in lines:
        line["items"].sort(key=lambda s: _box(s)[0])

    if no_box:
        lines.append({
            "items": no_box,
            "cy": 10 ** 9,
            "h": 1,
            "y0": 10 ** 9,
            "y1": 10 ** 9,
            "x0": 0,
        })
    return lines


def sort_reading_order(segments: Iterable[Segment]) -> List[Segment]:
    ordered: List[Segment] = []
    for line in cluster_lines(segments):
        ordered.extend(line["items"])
    return ordered


def assign_ids(segments: List[Segment], page: int) -> List[Segment]:
    for i, seg in enumerate(segments):
        seg["id"] = f"p{page}-s{i}"
        seg["page"] = page
    return segments


def _is_cjk(ch: str) -> bool:
    if not ch:
        return False
    o = ord(ch)
    return (
        0x4E00 <= o <= 0x9FFF
        or 0x3400 <= o <= 0x4DBF
        or 0x3000 <= o <= 0x303F
        or 0xFF00 <= o <= 0xFFEF
    )


def join_tokens(texts: List[str]) -> str:
    """中文之间不加空格,拉丁词之间加空格。"""
    out = ""
    for token in texts:
        token = (token or "").strip()
        if not token:
            continue
        if not out:
            out = token
            continue
        if _is_cjk(out[-1]) and _is_cjk(token[0]):
            out += token
        else:
            out += " " + token
    return out


def _line_text(line: Dict) -> str:
    return join_tokens([s.get("text", "") for s in line["items"]])


def _ends_sentence(text: str) -> bool:
    return bool(text) and text[-1] in "。！？；…—”』」.!?;:)]】》"


def format_lines(lines: List[Dict], mode: str) -> str:
    mode = mode if mode in LAYOUT_MODES else DEFAULT_LAYOUT
    usable = [ln for ln in lines if _line_text(ln)]
    if not usable:
        return ""

    if mode == LAYOUT_RAW:
        return "\n".join(_line_text(ln) for ln in usable)

    if mode == LAYOUT_SINGLE:
        return join_tokens([_line_text(ln) for ln in usable])

    # paragraph: 间距接近且缩进接近则合并
    heights = [max(1, ln["y1"] - ln["y0"]) for ln in usable]
    avg_h = sum(heights) / len(heights)
    parts: List[str] = []
    buffer = _line_text(usable[0])
    prev = usable[0]
    for ln in usable[1:]:
        gap = ln["y0"] - prev["y1"]
        indent_diff = abs(ln["x0"] - prev["x0"])
        same_para = gap < 1.35 * avg_h and indent_diff < 1.8 * avg_h and not _ends_sentence(buffer)
        if same_para:
            nxt = _line_text(ln)
            if _is_cjk(buffer[-1]) and _is_cjk(nxt[0]):
                buffer += nxt
            else:
                buffer += " " + nxt
        else:
            parts.append(buffer)
            buffer = _line_text(ln)
        prev = ln
    parts.append(buffer)
    return "\n".join(parts)


def layout_text(
    segments: Iterable[Segment],
    image_height: int,
    mode: str = DEFAULT_LAYOUT,
    header: float = DEFAULT_IGNORE,
    footer: float = DEFAULT_IGNORE,
) -> Tuple[str, List[Segment]]:
    """过滤 + 阅读顺序后生成文本,返回 (text, 排序后的分段)。"""
    filtered = filter_ignore(segments, image_height, header, footer)
    ordered = sort_reading_order(filtered)
    lines = cluster_lines(ordered)
    return format_lines(lines, mode), ordered


def join_pages(page_texts: List[str], total_pages: int, processed_pages: int) -> str:
    if len(page_texts) == 1 and total_pages == 1:
        return page_texts[0]
    parts = [f"—— 第 {i} 页 ——\n{text}" for i, text in enumerate(page_texts, start=1)]
    joined = "\n\n".join(parts)
    if total_pages > processed_pages:
        joined += f"\n\n(共 {total_pages} 页,已识别前 {processed_pages} 页)"
    return joined


def reflow_pages(
    pages: List[Dict],
    mode: str = DEFAULT_LAYOUT,
    header: float = DEFAULT_IGNORE,
    footer: float = DEFAULT_IGNORE,
) -> str:
    """按页对已保存的 segments 重新排版,不重新跑模型。"""
    if not pages:
        return ""
    texts: List[str] = []
    for page in pages:
        segs = page.get("segments") or []
        height = int(page.get("height") or 0)
        text, _ = layout_text(segs, height, mode, header, footer)
        texts.append(text)
    return join_pages(texts, len(pages), len(pages))
