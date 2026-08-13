"""SQLite 持久化层:识别历史记录与图片文件索引。

数据目录结构(容器内为 /app/data,由 docker-compose 挂载到宿主机):
    data/
      scans.db          历史记录数据库
      images/           原图预览与缩略图文件
"""
import json
import os
import sqlite3
import threading
from typing import List, Optional

DATA_DIR = os.environ.get(
    "DATA_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"),
)
IMAGES_DIR = os.path.join(DATA_DIR, "images")
DB_PATH = os.path.join(DATA_DIR, "scans.db")

# sqlite 写操作串行化(FastAPI 会在多个线程中调用)
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


def init_db() -> None:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row, with_segments: bool) -> dict:
    d = {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "status": row["status"],
        "file_size": row["file_size"],
        "confidence": row["confidence"],
        "processing_time": row["processing_time"],
        "extracted_text": row["extracted_text"],
        "image_url": f"/api/images/{row['image_file']}" if row["image_file"] else "",
        "thumb_url": f"/api/images/{row['thumb_file']}" if row["thumb_file"] else "",
        "image_width": row["image_width"],
        "image_height": row["image_height"],
        "page_count": row["page_count"],
    }
    if with_segments:
        try:
            d["segments"] = json.loads(row["segments_json"])
        except (ValueError, TypeError):
            d["segments"] = []
    return d


def create_scan(record: dict) -> dict:
    with _write_lock, _connect() as conn:
        conn.execute(
            """INSERT INTO scans
               (id, title, created_at, status, file_size, confidence, processing_time,
                extracted_text, segments_json, image_file, thumb_file,
                image_width, image_height, page_count)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record["id"], record["title"], record["created_at"], record["status"],
                record["file_size"], record["confidence"], record["processing_time"],
                record["extracted_text"], json.dumps(record.get("segments", []), ensure_ascii=False),
                record["image_file"], record["thumb_file"],
                record["image_width"], record["image_height"], record.get("page_count", 1),
            ),
        )
    return get_scan(record["id"], with_segments=True)


def list_scans() -> List[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM scans ORDER BY created_at DESC"
        ).fetchall()
    return [_row_to_dict(r, with_segments=False) for r in rows]


def get_scan(scan_id: str, with_segments: bool = True) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    return _row_to_dict(row, with_segments) if row else None


def update_scan_text(scan_id: str, text: str) -> Optional[dict]:
    with _write_lock, _connect() as conn:
        cur = conn.execute(
            "UPDATE scans SET extracted_text = ? WHERE id = ?", (text, scan_id)
        )
        if cur.rowcount == 0:
            return None
    return get_scan(scan_id, with_segments=False)


def delete_scan(scan_id: str) -> bool:
    """删除记录并清理关联的图片文件。"""
    with _write_lock, _connect() as conn:
        row = conn.execute(
            "SELECT image_file, thumb_file FROM scans WHERE id = ?", (scan_id,)
        ).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM scans WHERE id = ?", (scan_id,))

    for filename in (row["image_file"], row["thumb_file"]):
        if not filename:
            continue
        path = os.path.join(IMAGES_DIR, filename)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    return True
