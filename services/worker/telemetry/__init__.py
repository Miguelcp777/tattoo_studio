"""What the studio did, for whom, how long it took and what it cost (TASK-0054).

An append-only record of events: every paid provider call with its tokens and duration, every
generation with its outcome, every upload, kept photo and erasure, and the consultation turns the
web tier reports. It is for monitoring the service, and nothing reads it to make a decision.

Two rules shape it:

- **It never breaks the studio.** Recording is a non-blocking put into a bounded buffer that a
  background thread flushes. If the store is unreachable, events are dropped and counted; no
  request waits for it and none fails because of it.
- **It holds no image.** Events carry ids, sizes, counts, durations, token counts and short text.
  A photograph of a body is recorded as having been uploaded, never as what it shows. Erasing an
  account's data strips the account and the text from its events and keeps only the numbers.
"""

from .events import (
    Event,
    TelemetrySink,
    activity,
    configure,
    current_account,
    forget,
    record,
    sink,
)
from .store import EventStore, open_store

__all__ = [
    "Event",
    "EventStore",
    "TelemetrySink",
    "activity",
    "configure",
    "current_account",
    "forget",
    "open_store",
    "record",
    "sink",
]
