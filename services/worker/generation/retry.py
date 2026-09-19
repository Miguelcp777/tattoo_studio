"""Retry policy for provider calls.

Transient failures retry with exponential backoff and a hard cap. Terminal failures —
policy rejections above all — are re-raised immediately (GEN error semantics).

The sleep function is injected so tests assert retry behaviour by call count without
spending real time.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from .errors import GenerationError

T = TypeVar("T")

Sleep = Callable[[float], None]


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    """Bounded exponential backoff.

    ``max_attempts`` counts the first try, so 3 means one call plus two retries.
    """

    max_attempts: int = 3
    base_delay_seconds: float = 0.5
    max_delay_seconds: float = 8.0

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")

    def delay_for(self, attempt: int) -> float:
        """Delay before the given 1-based attempt number."""
        raw: float = self.base_delay_seconds * float(2 ** max(0, attempt - 1))
        return min(raw, self.max_delay_seconds)


def call_with_retry(
    operation: Callable[[], T],
    *,
    policy: RetryPolicy,
    sleep: Sleep,
) -> T:
    """Run ``operation``, retrying only transient :class:`GenerationError`s."""
    last: GenerationError | None = None

    for attempt in range(1, policy.max_attempts + 1):
        try:
            return operation()
        except GenerationError as error:
            if not error.transient:
                # Terminal: a policy rejection must never be retried, and a malformed
                # request will not become well-formed by repetition.
                raise
            last = error
            if attempt == policy.max_attempts:
                break
            sleep(policy.delay_for(attempt))

    assert last is not None
    raise last
