"""Recording events without knowing where they go (TASK-0054).

Callers state what happened; the account and job it belongs to come from the ``activity`` in
force, so a provider deep inside a generation does not need to be told whose generation it is.
"""

from __future__ import annotations

import contextlib
import contextvars
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

#: The longest text an event keeps. A consultation turn is short; this bounds a pathological one.
MAX_TEXT = 4000


@dataclass(frozen=True)
class Event:
    kind: str
    operation: str
    outcome: str = "ok"
    account: str | None = None
    job: str | None = None
    provider: str | None = None
    model: str | None = None
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    images: int | None = None
    cost_usd: float | None = None
    text: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)
    ts: datetime = field(default_factory=lambda: datetime.now(UTC))


class TelemetrySink(Protocol):
    def put(self, event: Event) -> None: ...

    def forget(self, account: str) -> None: ...


class _Discard:
    """Until the worker is configured, events go nowhere. Tests that care install a store."""

    def put(self, event: Event) -> None:
        return None

    def forget(self, account: str) -> None:
        return None


_sink: TelemetrySink = _Discard()
_activity: contextvars.ContextVar[tuple[str | None, str | None]] = contextvars.ContextVar(
    "telemetry_activity", default=(None, None)
)


def configure(target: TelemetrySink) -> None:
    global _sink
    _sink = target


def sink() -> TelemetrySink:
    return _sink


@contextlib.contextmanager
def activity(account: str | None, job: str | None = None) -> Iterator[None]:
    """Attribute every event recorded inside to this account and job."""
    token = _activity.set((account, job))
    try:
        yield
    finally:
        _activity.reset(token)


def current_account() -> str | None:
    return _activity.get()[0]


def record(kind: str, operation: str, **fields: Any) -> None:
    """
    Record one event. Never raises: monitoring that can fail a request is worse than none.

    ``account`` and ``job`` default to the current ``activity``; ``text`` is truncated.
    """
    try:
        account, job = _activity.get()
        fields.setdefault("account", account)
        fields.setdefault("job", job)
        text = fields.get("text")
        if isinstance(text, str):
            fields["text"] = text[:MAX_TEXT]
        _sink.put(Event(kind=kind, operation=operation, **fields))
    except Exception:  # see the docstring
        return


def forget(account: str) -> None:
    """Strip an erased account's identity and words from its events; keep the numbers."""
    try:
        _sink.forget(account)
    except Exception:  # erasure of the account's data is done elsewhere
        return
