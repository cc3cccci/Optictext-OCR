"""SQLite 持久化层:识别历史、分页预览与原件索引。

数据目录:
    data/
      scans.db
      images/       预览图 / 缩略图 / 分页 JPEG
      originals/    上传原件(供重试与可检索 PDF)
"""
import json
import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

DATA_DIR = os.environ.get(
    "DATA_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"),
)
IMAGES_DIR = os.path.join(DATA_DIR, "images")
ORIGINALS_DIR = os.path.join(DATA_DIR, "originals")
DB_PATH = os.path.join(DATA_DIR, "scans.db")
TEXT_PREVIEW_LEN = 160

_write_lock = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'READY',
    file_size       INTEGER NOT NULL DEFAULT 0,
    confidence      REAL NOT NULL DEFAULT 0,
    processing_time REAL NOT NULL DEFAULT 0,
    extracted_text  TEXT NOT NULL DEFAULT '',
    segments_json   TEXT NOT NULL DEFAULT '[]',
    image_file      TEXT NOT NULL DEFAULT '',
    thumb_file      TEXT NOT NULL DEFAULT '',
    image_width     INTEGER NOT NULL DEFAULT 0,
    image_height    INTEGER NOT NULL DEFAULT 0,
    page_count      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
"""

_EXTRA_COLUMNS = [
    ("page_done", "INTEGER NOT NULL DEFAULT 0"),
    ("error_message", "TEXT NOT NULL DEFAULT ''"),
    ("original_file", "TEXT NOT NULL DEFAULT ''"),
    ("layout_mode", "TEXT NOT NULL DEFAULT 'paragraph'"),
    ("ignore_header", "REAL NOT NULL DEFAULT 0.08"),
    ("ignore_footer", "REAL NOT NULL DEFAULT 0.08"),
    ("pages_json", "TEXT NOT NULL DEFAULT '[]'"),
    ("tags", "TEXT NOT NULL DEFAULT '[]'"),
    ("pinned", "INTEGER NOT NULL DEFAULT 0"),
    ("content_hash", "TEXT NOT NULL DEFAULT ''"),
]


def init_db() -> None:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(ORIGINALS_DIR, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        _ensure_columns(conn)


def _ensure_columns(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(scans)")}
    for name, spec in _EXTRA_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE scans ADD COLUMN {name} {spec}")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _col(row: sqlite3.Row, name: str, default: Any) -> Any:
    try:
        value = row[name]
    except (IndexError, KeyError):
        return default
    return default if value is None else value


def _image_url(filename: str) -> str:
    return f"/api/images/{filename}" if filename else ""


def _parse_tags(raw: Any) -> List[str]:
    if isinstance(raw, list):
        tags = raw
    else:
        try:
            tags = json.loads(raw or "[]")
        except (ValueError, TypeError):
            return []
    if not isinstance(tags, list):
        return []
    seen = set()
    out: List[str] = []
    for item in tags:
        tag = str(item).strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        out.append(tag[:24])
        if len(out) >= 12:
            break
    return out


def _pages_from_row(row: sqlite3.Row) -> List[dict]:
    try:
        pages = json.loads(_col(row, "pages_json", "[]") or "[]")
    except (ValueError, TypeError):
        pages = []
    public = []
    for page in pages:
        image_file = page.get("image_file") or ""
        public.append({
            "index": page.get("index", 0),
            "image_file": image_file,
            "image_url": _image_url(image_file),
            "width": page.get("width") or 0,
            "height": page.get("height") or 0,
            "segments": page.get("segments") or [],
        })
    return public


def _row_to_dict(row: sqlite3.Row, *, with_text: bool, with_segments: bool) -> dict:
    extracted = _col(row, "extracted_text", "") or ""
    d = {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "status": row["status"],
        "file_size": row["file_size"],
        "confidence": row["confidence"],
        "processing_time": row["processing_time"],
        "image_url": _image_url(row["image_file"]),
        "thumb_url": _image_url(row["thumb_file"]),
        "image_file": row["image_file"],
        "thumb_file": row["thumb_file"],
        "image_width": row["image_width"],
        "image_height": row["image_height"],
        "page_count": row["page_count"],
        "page_done": _col(row, "page_done", 0),
        "error_message": _col(row, "error_message", ""),
        "original_file": _col(row, "original_file", ""),
        "layout_mode": _col(row, "layout_mode", "paragraph"),
        "ignore_header": _col(row, "ignore_header", 0.08),
        "ignore_footer": _col(row, "ignore_footer", 0.08),
        "text_preview": extracted[:TEXT_PREVIEW_LEN],
        "tags": _parse_tags(_col(row, "tags", "[]")),
        "pinned": bool(_col(row, "pinned", 0)),
        "content_hash": _col(row, "content_hash", "") or "",
    }
    if with_text:
        d["extracted_text"] = extracted
        d["pages"] = _pages_from_row(row)
    if with_segments:
        try:
            d["segments"] = json.loads(row["segments_json"] or "[]")
        except (ValueError, TypeError):
            d["segments"] = []
        if "pages" not in d:
            d["pages"] = _pages_from_row(row)
    return d


def create_scan(record: dict) -> dict:
    with _write_lock, _connect() as conn:
        conn.execute(
            """INSERT INTO scans
               (id, title, created_at, status, file_size, confidence, processing_time,
                extracted_text, segments_json, image_file, thumb_file,
                image_width, image_height, page_count, page_done, error_message,
                original_file, layout_mode, ignore_header, ignore_footer, pages_json,
                tags, pinned, content_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record["id"], record["title"], record["created_at"],
                record.get("status", "PROCESSING"),
                record.get("file_size", 0),
                record.get("confidence", 0),
                record.get("processing_time", 0),
                record.get("extracted_text", ""),
                json.dumps(record.get("segments", []), ensure_ascii=False),
                record.get("image_file", ""),
                record.get("thumb_file", ""),
                record.get("image_width", 0),
                record.get("image_height", 0),
                record.get("page_count", 1),
                record.get("page_done", 0),
                record.get("error_message", ""),
                record.get("original_file", ""),
                record.get("layout_mode", "paragraph"),
                record.get("ignore_header", 0.08),
                record.get("ignore_footer", 0.08),
                json.dumps(record.get("pages", []), ensure_ascii=False),
                json.dumps(_parse_tags(record.get("tags", [])), ensure_ascii=False),
                1 if record.get("pinned") else 0,
                record.get("content_hash", "") or "",
            ),
        )
    return get_scan(record["id"], with_segments=True) or {}


def update_scan_fields(scan_id: str, **fields: Any) -> Optional[dict]:
    if not fields:
        return get_scan(scan_id, with_segments=True)
    allowed = {
        "status", "file_size", "confidence", "processing_time", "extracted_text",
        "segments_json", "image_file", "thumb_file", "image_width", "image_height",
        "page_count", "page_done", "error_message", "original_file", "layout_mode",
        "ignore_header", "ignore_footer", "pages_json", "title",
        "tags", "pinned", "content_hash",
    }
    assignments = []
    values: List[Any] = []
    for key, value in fields.items():
        if key == "segments":
            key, value = "segments_json", json.dumps(value, ensure_ascii=False)
        elif key == "pages":
            key, value = "pages_json", json.dumps(value, ensure_ascii=False)
        elif key == "tags" and not isinstance(value, str):
            value = json.dumps(_parse_tags(value), ensure_ascii=False)
        elif key == "pinned":
            value = 1 if value else 0
        if key not in allowed:
            continue
        assignments.append(f"{key} = ?")
        values.append(value)
    if not assignments:
        return get_scan(scan_id, with_segments=True)
    values.append(scan_id)
    with _write_lock, _connect() as conn:
        cur = conn.execute(
            f"UPDATE scans SET {', '.join(assignments)} WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            return None
    return get_scan(scan_id, with_segments=True)


def list_scans(query: Optional[str] = None) -> List[dict]:
    sql = "SELECT * FROM scans"
    params: tuple = ()
    if query and query.strip():
        like = f"%{query.strip()}%"
        sql += " WHERE title LIKE ? OR extracted_text LIKE ?"
        params = (like, like)
    sql += " ORDER BY pinned DESC, created_at DESC"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r, with_text=False, with_segments=False) for r in rows]


def get_scan(scan_id: str, with_segments: bool = True) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    if row is None:
        return None
    return _row_to_dict(row, with_text=True, with_segments=with_segments)


def find_by_hash(content_hash: str, exclude_id: Optional[str] = None) -> Optional[dict]:
    if not content_hash:
        return None
    sql = "SELECT * FROM scans WHERE content_hash = ?"
    params: List[Any] = [content_hash]
    if exclude_id:
        sql += " AND id != ?"
        params.append(exclude_id)
    sql += " LIMIT 1"
    with _connect() as conn:
        row = conn.execute(sql, params).fetchone()
    if row is None:
        return None
    return _row_to_dict(row, with_text=False, with_segments=False)


def update_scan_text(scan_id: str, text: str) -> Optional[dict]:
    return update_scan_fields(scan_id, extracted_text=text)


def delete_scans(ids: List[str]) -> int:
    deleted = 0
    for scan_id in ids:
        if delete_scan(scan_id):
            deleted += 1
    return deleted


def delete_scan(scan_id: str) -> bool:
    with _write_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM scans WHERE id = ?", (scan_id,))

    files = [row["image_file"], row["thumb_file"]]
    try:
        pages = json.loads(_col(row, "pages_json", "[]") or "[]")
    except (ValueError, TypeError):
        pages = []
    for page in pages:
        if page.get("image_file"):
            files.append(page["image_file"])
    original = _col(row, "original_file", "")
    for filename in files:
        if not filename:
            continue
        path = os.path.join(IMAGES_DIR, filename)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    if original:
        path = os.path.join(ORIGINALS_DIR, original)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    return True
