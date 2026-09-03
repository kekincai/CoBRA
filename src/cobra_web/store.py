"""Append-only SQLite records. Historical snapshots are never overwritten."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(
                "CREATE TABLE IF NOT EXISTS records (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            db.execute("CREATE INDEX IF NOT EXISTS records_kind ON records(kind, entity_id, seq)")

    @contextmanager
    def connect(self):
        with sqlite3.connect(self.path, timeout=15) as db:
            db.row_factory = sqlite3.Row
            yield db

    def add_many(self, kind, payloads):
        output = []
        with self.connect() as db:
            for payload in payloads:
                identifier = f"{kind}-{uuid4().hex[:12]}"
                created = datetime.now(timezone.utc).isoformat()
                db.execute(
                    "INSERT INTO records (id,kind,entity_id,created_at,payload) VALUES (?,?,?,?,?)",
                    (
                        identifier,
                        kind,
                        payload.get("id", identifier),
                        created,
                        json.dumps(payload, ensure_ascii=False, allow_nan=False),
                    ),
                )
                output.append({"id": identifier, "created_at": created, "data": payload})
        return output

    def add(self, kind, payload):
        return self.add_many(kind, [payload])[0]

    def all(self, kind, latest=False):
        with self.connect() as db:
            query = "SELECT * FROM records WHERE kind=?"
            if latest:
                query += (
                    " AND seq IN (SELECT MAX(seq) FROM records WHERE kind=? GROUP BY entity_id)"
                )
            rows = db.execute(
                query + " ORDER BY seq DESC", (kind, kind) if latest else (kind,)
            ).fetchall()
        return [
            {"id": r["id"], "created_at": r["created_at"], "data": json.loads(r["payload"])}
            for r in rows
        ]

    def get(self, identifier, kind=None):
        with self.connect() as db:
            row = db.execute("SELECT * FROM records WHERE id=?", (identifier,)).fetchone()
        if row is None or (kind and row["kind"] != kind):
            raise KeyError("指定の保存データが見つかりません。")
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "data": json.loads(row["payload"]),
        }
