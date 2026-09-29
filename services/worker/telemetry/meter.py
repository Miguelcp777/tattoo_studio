"""Metering one paid provider call (TASK-0054).

    with provider_call("openai", "artwork", model) as call:
        response = client.post(...)
        call.read(response)

The event is recorded when the block ends, whether it succeeded or raised, with its duration,
tokens and estimated cost. The exception is re-raised untouched: metering never changes behaviour.
"""

from __future__ import annotations

import contextlib
import time
from collections.abc import Iterator
from typing import Any

from . import usage
from .events import record
from .usage import tokens


class Call:
    def __init__(self) -> None:
        self.input_tokens: int | None = None
        self.output_tokens: int | None = None
        self.images: int | None = None
        self.detail: dict[str, Any] = {}
        #: Set when the provider answered with an error status, which the caller raises on later.
        self.failed: str | None = None

    def read(self, response: Any) -> None:
        """Take the status, token counts and image count from a response, where it has them."""
        status = getattr(response, "status_code", None)
        if isinstance(status, int) and status >= 400:
            self.failed = f"HTTP {status}"
        try:
            body = response.json()
        except Exception:  # a body we cannot read simply reports no usage
            return
        self.input_tokens, self.output_tokens = tokens(body)
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, list):
            self.images = len(data)


@contextlib.contextmanager
def provider_call(provider: str, operation: str, model: str | None) -> Iterator[Call]:
    call = Call()
    started = time.monotonic()
    outcome = "ok"
    try:
        yield call
    except Exception as error:
        outcome = "error"
        # Our own refusals are written for the client and carry no secrets; anything else is
        # reported by type only, since a transport error can quote a URL or a header.
        call.detail["error"] = (
            str(error)[:300] if isinstance(error, ValueError) else type(error).__name__
        )
        raise
    finally:
        if call.failed and outcome == "ok":
            outcome = "error"
            call.detail.setdefault("error", call.failed)
        record(
            "provider_call",
            operation,
            provider=provider,
            model=model,
            outcome=outcome,
            duration_ms=int((time.monotonic() - started) * 1000),
            input_tokens=call.input_tokens,
            output_tokens=call.output_tokens,
            images=call.images,
            cost_usd=usage.PRICES.cost(model, call.input_tokens, call.output_tokens, call.images),
            detail=call.detail,
        )
