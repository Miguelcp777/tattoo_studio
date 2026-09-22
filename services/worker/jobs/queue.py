"""Single-worker durable queue. Interrupted calls fail, never silently recharge."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from tattoo_contracts.validation import validate


class JobQueue:
    def __init__(
        self,
        path: Path,
        execute: Callable[[str, dict[str, Any]], dict[str, Any]],
        maintenance: Callable[[], None] | None = None,
    ) -> None:
        self.path = path
        self.execute = execute
        self.maintenance = maintenance
        self.stop = threading.Event()
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT, idem "
                "TEXT, payload TEXT, state TEXT, result TEXT, error TEXT, created REAL, "
                "UNIQUE(owner,idem))"
            )
            db.execute(
                "UPDATE jobs SET state='failed',error='El worker se reinició durante la "
                "generación. Reintenta manualmente.' WHERE state='running'"
            )
        self.thread = threading.Thread(target=self.run, daemon=True)

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def enqueue(self, owner: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND idem=?", (owner, payload["idempotencyKey"])
            ).fetchone()
            if existing:
                if json.loads(existing["payload"]) != payload:
                    raise ValueError("La clave de solicitud ya se usó con otro diseño.")
                return self.public(existing)
            active = db.execute(
                "SELECT count(*) FROM jobs WHERE state IN ('queued','running')"
            ).fetchone()[0]
            own = db.execute(
                "SELECT count(*) FROM jobs WHERE owner=? AND state IN ('queued','running')",
                (owner,),
            ).fetchone()[0]
            if active >= 8 or own >= 1:
                raise ValueError("Ya hay una generación en curso o la cola está llena.")
            job_id = uuid.uuid4().hex
            db.execute(
                "INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)",
                (
                    job_id,
                    owner,
                    payload["idempotencyKey"],
                    json.dumps(payload),
                    "queued",
                    None,
                    None,
                    time.time(),
                ),
            )
        return self.get(owner, job_id)

    @staticmethod
    def public(row: sqlite3.Row) -> dict[str, Any]:
        result = {
            "jobId": row["id"],
            "state": row["state"],
            "result": json.loads(row["result"]) if row["result"] else None,
            "error": row["error"],
        }
        if validate("studio-status", result):
            raise ValueError("Estado de trabajo inválido; no se entregará como resultado válido.")
        return result

    def get(self, owner: str, job_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM jobs WHERE id=? AND owner=?", (job_id, owner)
            ).fetchone()
        if row is None:
            raise KeyError("Trabajo no encontrado")
        return self.public(row)

    def cancel(self, owner: str, job_id: str) -> None:
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET state='cancelled', result=NULL WHERE id=? AND owner=?",
                (job_id, owner),
            )

    def history(self, owner: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND state='succeeded' "
                "AND created > ? ORDER BY created DESC LIMIT 20",
                (owner, time.time() - 86400),
            ).fetchall()
        return [self.public(row) for row in rows]

    def source_payload(self, owner: str, job_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                "SELECT payload FROM jobs WHERE id=? AND owner=? AND state='succeeded'",
                (job_id, owner),
            ).fetchone()
        if row is None:
            raise ValueError("La propuesta original no está disponible en esta sesión.")
        return dict(json.loads(row[0]))

    def tick(self) -> bool:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1"
            ).fetchone()
            if row is None:
                return False
            db.execute("UPDATE jobs SET state='running' WHERE id=?", (row["id"],))
        try:
            result = self.execute(row["owner"], json.loads(row["payload"]))
            state, error = "succeeded", None
        except ValueError as failure:
            result, state, error = None, "failed", str(failure)[:400]
        except Exception:
            result, state, error = (
                None,
                "failed",
                "No se pudo completar el trabajo. No hay un resultado válido.",
            )
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET state=?,result=?,error=? WHERE id=? AND state='running'",
                (state, json.dumps(result) if result else None, error, row["id"]),
            )
        return True

    def run(self) -> None:
        next_cleanup = 0.0
        while not self.stop.is_set():
            if self.maintenance and time.monotonic() >= next_cleanup:
                try:
                    self.maintenance()
                except Exception:
                    logging.getLogger(__name__).error("Media cleanup failed; retry scheduled.")
                next_cleanup = time.monotonic() + 60
            if not self.tick():
                self.stop.wait(0.5)
