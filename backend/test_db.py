"""SQLite 元数据测试:标签、置顶、内容哈希、批量删除。不依赖 OCR。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PASSED = []
FAILED = []


def check(name: str, condition: bool, detail: str = ""):
    if condition:
        PASSED.append(name)
        print(f"[通过] {name}")
    else:
        FAILED.append(name)
        print(f"[失败] {name} {detail}")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["DATA_DIR"] = tmp
        import importlib
        import db
        importlib.reload(db)
        db.init_db()

        rec = db.create_scan({
            "id": "s1",
            "title": "photo.png",
            "created_at": "2026-08-13T10:00:00+00:00",
            "status": "READY",
            "extracted_text": "发票抬头 ABC",
            "tags": ["发票"],
            "pinned": 0,
            "content_hash": "abc123",
        })
        check("写入 tags", rec.get("tags") == ["发票"], str(rec.get("tags")))
        check("写入 hash", rec.get("content_hash") == "abc123")

        db.create_scan({
            "id": "s2",
            "title": "note.png",
            "created_at": "2026-08-13T11:00:00+00:00",
            "status": "READY",
            "extracted_text": "会议纪要",
            "pinned": 1,
            "content_hash": "def456",
        })
        listing = db.list_scans()
        check("置顶排在前面", listing[0]["id"] == "s2", listing[0]["id"])

        hit = db.find_by_hash("abc123")
        check("按 hash 查找", hit is not None and hit["id"] == "s1", str(hit))
        miss = db.find_by_hash("abc123", exclude_id="s1")
        check("排除自身后无重复", miss is None)

        updated = db.update_scan_fields("s1", title="发票", tags=["发票", "财务"], pinned=True)
        check("PATCH 标题", updated.get("title") == "发票")
        check("PATCH 标签去重", updated.get("tags") == ["发票", "财务"], str(updated.get("tags")))
        check("PATCH 置顶", updated.get("pinned") is True)

        deleted = db.delete_scans(["s1", "s2", "missing"])
        check("批量删除计数", deleted == 2, str(deleted))
        check("删除后列表为空", db.list_scans() == [])

    print(f"\n结果:{len(PASSED)} 项通过,{len(FAILED)} 项失败")
    if FAILED:
        print("失败项:", ", ".join(FAILED))
        sys.exit(1)


if __name__ == "__main__":
    main()
