"""Where events are kept (TASK-0054).

One store, two databases: SQLite in development and in the tests, Postgres (Supabase) in
production. The statements are written once and run on both, so the SQL the tests execute is the
SQL production runs; only the connection and the placeholder style differ.

Writes are buffered and flushed by a background thread in batches. Nothing on a request path waits
for the database, and a database that is down costs events, never requests.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from .events import Event

Style = Literal["sqlite", "postgres"]

#: The most events held in memory while the database is slow or away. Beyond it the oldest go.
BUFFER = 10_000

COLUMNS = (
    "ts",
    "kind",
    "operation",
    "outcome",
    "account",
    "job",
    "provider",
    "model",
    "duration_ms",
    "input_tokens",
    "output_tokens",
    "images",
    "cost_usd",
    "text",
    "detail",
)

_FIELDS = ", ".join(COLUMNS)
_SLOTS = ", ".join(["%s"] * len(COLUMNS))
INSERT = f"INSERT INTO {{table}} ({_FIELDS}) VALUES ({_SLOTS})"
SELECT = f"SELECT {_FIELDS} FROM {{table}} WHERE ts >= %s AND ts < %s ORDER BY ts DESC LIMIT %s"
FORGET = "UPDATE {table} SET account = NULL, text = NULL WHERE account = %s"
PURGE = "DELETE FROM {table} WHERE ts < %s"

#: The development and test schema. Production's is `infra/supabase/telemetry.sql`, same columns.
SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    operation TEXT NOT NULL,
    outcome TEXT NOT NULL,
    account TEXT,
    job TEXT,
    provider TEXT,
    model TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    images INTEGER,
    cost_usd REAL,
    text TEXT,
    detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_account ON events (account);
"""


class EventStore:
    def __init__(
        self,
        connect: Callable[[], Any],
        *,
        style: Style,
        table: str = "events",
        flush_every: float = 2.0,
        retention: timedelta | None = None,
        start: bool = True,
    ) -> None:
        self._connect = connect
        self.style: Style = style
        self._table = table
        self._buffer: deque[Event] = deque(maxlen=BUFFER)
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._flush_every = flush_every
        #: Events older than this are deleted, once an hour (storage limitation, TASK-0054).
        self._retention = retention
        self._next_purge = 0.0
        #: Events lost to a full buffer or a failed write. Visible, so a gap is never silent.
        self.dropped = 0
        self._thread = threading.Thread(target=self._run, daemon=True, name="telemetry")
        if start:
            self._thread.start()

    # -- writing ------------------------------------------------------------------------------

    def put(self, event: Event) -> None:
        with self._lock:
            if len(self._buffer) == self._buffer.maxlen:
                self.dropped += 1
            self._buffer.append(event)

    def flush(self) -> int:
        """Write everything buffered. Returns how many events were written."""
        with self._lock:
            batch = list(self._buffer)
            self._buffer.clear()
        if not batch:
            return 0
        try:
            self._execute_many(INSERT, [self._row(event) for event in batch])
        except Exception:  # the studio must not fail because monitoring did
            self.dropped += len(batch)
            logging.getLogger(__name__).error(
                "Telemetry write failed; %d events dropped.", len(batch)
            )
            return 0
        return len(batch)

    def forget(self, account: str) -> None:
        """Keep an erased account's numbers, drop who it was and what it wrote (TASK-0054)."""
        self.flush()
        self._execute(FORGET, (account,))

    def purge(self, before: datetime) -> None:
        # Buffered events are written first, or an old one still in memory would outlive the purge.
        self.flush()
        self._execute(PURGE, (self._time(before),))

    def close(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)
        self.flush()

    # -- reading ------------------------------------------------------------------------------

    def events(
        self, since: datetime, until: datetime | None = None, limit: int = 5000
    ) -> list[dict[str, Any]]:
        """Events in ``[since, until)``, newest first, as plain dictionaries."""
        self.flush()
        end = until or datetime.now(UTC)
        rows = self._query(SELECT, (self._time(since), self._time(end), limit))
        found: list[dict[str, Any]] = []
        for row in rows:
            item = dict(zip(COLUMNS, row, strict=True))
            item["ts"] = self._parse_time(item["ts"])
            item["detail"] = json.loads(item["detail"] or "{}")
            if item["cost_usd"] is not None:
                item["cost_usd"] = float(item["cost_usd"])
            found.append(item)
        return found

    # -- plumbing -----------------------------------------------------------------------------

    def _run(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(self._flush_every)
            self._wake.clear()
            self.flush()
            if self._retention and time.monotonic() >= self._next_purge:
                self._next_purge = time.monotonic() + 3600
                try:
                    self.purge(datetime.now(UTC) - self._retention)
                except Exception:  # retried in an hour
                    logging.getLogger(__name__).error("Telemetry retention purge failed.")

    def _sql(self, statement: str) -> str:
        sql = statement.format(table=self._table)
        return sql.replace("%s", "?") if self.style == "sqlite" else sql

    def _time(self, moment: datetime) -> Any:
        # SQLite keeps ISO text, which sorts in time order when every value is UTC and uniform.
        return moment.astimezone(UTC).isoformat() if self.style == "sqlite" else moment

    @staticmethod
    def _parse_time(value: Any) -> datetime:
        return value if isinstance(value, datetime) else datetime.fromisoformat(value)

    def _row(self, event: Event) -> tuple[Any, ...]:
        values = asdict(event)
        values["ts"] = self._time(event.ts)
        values["detail"] = json.dumps(event.detail, ensure_ascii=False, default=str)
        return tuple(values[column] for column in COLUMNS)

    def _execute(self, statement: str, params: tuple[Any, ...]) -> None:
        connection = self._connect()
        try:
            connection.execute(self._sql(statement), params)
            connection.commit()
        finally:
            connection.close()

    def _execute_many(self, statement: str, rows: Iterable[tuple[Any, ...]]) -> None:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.executemany(self._sql(statement), list(rows))
            connection.commit()
        finally:
            connection.close()

    def _query(self, statement: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]:
        connection = self._connect()
        try:
            return list(connection.execute(self._sql(statement), params).fetchall())
        finally:
            connection.close()


def sqlite_store(path: Path, **options: Any) -> EventStore:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.executescript(SQLITE_SCHEMA)
    return EventStore(lambda: sqlite3.connect(path, timeout=10), style="sqlite", **options)


def postgres_store(dsn: str, **options: Any) -> EventStore:
    """
    The production store. Checked at startup so a wrong connection string or a missing grant
    stops the worker with a clear message instead of silently dropping every event (PLAT-INV-005).
    """
    import psycopg

    def connect() -> Any:
        # No server-side prepared statements: Supabase's pooler in transaction mode rejects them.
        return psycopg.connect(dsn, connect_timeout=5, prepare_threshold=None)

    table = "inkcraft.events"
    try:
        with connect() as probe:
            probe.execute(f"SELECT {', '.join(COLUMNS)} FROM {table} LIMIT 0")
    except Exception as error:
        # The driver's message can quote the connection string, which carries a password, so
        # only the error's type is reported and the original is not chained (SEC-INV-008).
        raise RuntimeError(
            f"La telemetría no puede usar Postgres ({type(error).__name__}). Revisa "
            "TATTOO_TELEMETRY_DSN, que se ha ejecutado infra/supabase/telemetry.sql y los "
            "permisos del usuario."
        ) from None
    return EventStore(connect, style="postgres", table=table, **options)


def open_store(dsn: str | None, data_dir: Path, **options: Any) -> EventStore:
    """Postgres when a connection string is configured; otherwise SQLite beside the studio data."""
    if dsn:
        return postgres_store(dsn, **options)
    return sqlite_store(data_dir / "telemetry.sqlite", **options)
