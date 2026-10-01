"""Single-worker durable queue. Interrupted calls fail, never silently recharge."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from pathlib import Path
from typing import Any

from tattoo_contracts.validation import validate

from jobs.client_messages import GENERIC, for_client
from telemetry import activity, record

#: The job this thread is executing, so a pipeline step can report itself (TASK-0076).
_running: ContextVar[str | None] = ContextVar("running_job", default=None)


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
        # TASK-0076 (audit UX-03): the step each running job is in, as the pipeline reports it.
        # In memory on purpose: a restart fails running jobs anyway.
        self.stages: dict[str, str] = {}
        self.stop = threading.Event()
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT, idem "
                "TEXT, payload TEXT, state TEXT, result TEXT, error TEXT, created REAL, "
                "UNIQUE(owner,idem))"
            )
            db.execute(
                "UPDATE jobs SET state='failed',error='El estudio se reinició mientras creaba "
                "tu diseño. Vuelve a generarlo.' WHERE state='running'"
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

    def find(self, owner: str, idempotency_key: str) -> dict[str, Any] | None:
        """The job already stored under this key, so a retried request does its work only once."""
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND idem=?", (owner, idempotency_key)
            ).fetchone()
        return self.public(row) if row else None

    def record(self, owner: str, payload: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
        """
        Store work finished outside the queue as a succeeded job (ADR-0022).

        A kept camera photograph costs no generation, so it is never queued. It is recorded here so
        that it lives where every other version lives — the owner's history — under the same
        retention and the same deletion. The result is validated before it is written, not only
        when it is read back, so an invalid one is never stored.
        """
        job_id = uuid.uuid4().hex
        status = {"jobId": job_id, "state": "succeeded", "result": result, "error": None}
        if validate("studio-status", status):
            raise ValueError("La foto no se ha podido guardar como versión.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND idem=?", (owner, payload["idempotencyKey"])
            ).fetchone()
            if existing:
                return self.public(existing)
            db.execute(
                "INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)",
                (
                    job_id,
                    owner,
                    payload["idempotencyKey"],
                    json.dumps(payload),
                    "succeeded",
                    json.dumps(result),
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
            status = self.public(row)
            # TASK-0076 (audit UX-03): what the client is shown comes from the queue and the
            # pipeline, never from a clock.
            if row["state"] == "running" and row["id"] in self.stages:
                status["stage"] = self.stages[row["id"]]
            elif row["state"] == "queued":
                ahead = db.execute(
                    "SELECT count(*) FROM jobs WHERE state='running' "
                    "OR (state='queued' AND created < ?)",
                    (row["created"],),
                ).fetchone()[0]
                status["queuePosition"] = ahead + 1
        return status

    def stage(self, name: str) -> None:
        """Record the pipeline step of the job running in this thread (TASK-0076)."""
        job = _running.get()
        if job:
            self.stages[job] = name

    def cancel(self, owner: str, job_id: str) -> None:
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET state='cancelled', result=NULL WHERE id=? AND owner=?",
                (job_id, owner),
            )

    def history(self, owner: str) -> list[dict[str, Any]]:
        """The owner's versions, newest first. Not windowed: designs do not expire (TASK-0047)."""
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM jobs WHERE owner=? AND state='succeeded' "
                "ORDER BY created DESC LIMIT 50",
                (owner,),
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
        payload = json.loads(row["payload"])
        started = time.monotonic()
        # Every provider call made for this job is attributed to its owner and to it (TASK-0054).
        token = _running.set(row["id"])
        with activity(row["owner"], row["id"]):
            try:
                result = self.execute(row["owner"], payload)
                state, error = "succeeded", None
            except ValueError as failure:
                result, state, error = None, "failed", str(failure)[:400]
            except Exception:
                result, state, error = None, "failed", GENERIC
            # TASK-0072: the panel keeps the cause as raised; the client reads it plainly.
            cause = error
            brief = payload.get("brief") or {}
            record(
                "job",
                "edit" if payload.get("edit") else "generate",
                outcome="ok" if state == "succeeded" else "error",
                duration_ms=int((time.monotonic() - started) * 1000),
                detail={
                    "error": cause,
                    "style": (brief.get("style") or {}).get("primary"),
                    "zone": (brief.get("placement") or {}).get("bodyPart"),
                    "colour": (brief.get("colour") or {}).get("mode"),
                    "ownPhoto": bool(payload.get("bodyPhotoId")),
                },
            )
        _running.reset(token)
        self.stages.pop(row["id"], None)
        with self.connect() as db:
            db.execute(
                "UPDATE jobs SET state=?,result=?,error=? WHERE id=? AND state='running'",
                (
                    state,
                    json.dumps(result) if result else None,
                    for_client(error) if error else None,
                    row["id"],
                ),
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
