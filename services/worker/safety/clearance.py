"""Proof that specific bytes passed the safety input gate.

This type lives here, and only this module may mint one. It sat in `generation` during
TASK-0004 purely because this module did not exist; `safety` is its proper home, and
moving it breaks the circular dependency FINDING-0003 recorded.

**A clearance is bound to a digest of the exact bytes screened.** A token meaning merely
"something passed" would let a caller screen a harmless image and then ingest a different
one, which defeats SEC-INV-007 entirely while appearing to satisfy it.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

#: Set only while :func:`mint_clearance` is running. A guard stored as a *field* was the
#: first attempt and was wrong: ``dataclasses.replace`` copies fields, so a valid
#: clearance could be cloned onto different bytes, which defeats the binding entirely.
#: A context flag does not survive a copy, so ``replace`` raises like any other forgery.
_minting: ContextVar[bool] = ContextVar("safety_minting", default=False)


@contextmanager
def _minting_scope() -> Iterator[None]:
    token = _minting.set(True)
    try:
        yield
    finally:
        _minting.reset(token)


def content_digest(data: bytes) -> str:
    """Stable identity for a byte sequence, used to bind a clearance to its image."""
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True, slots=True)
class SafetyClearance:
    """Evidence that the input gate passed for one specific image.

    Construct only through :func:`mint_clearance`, which is called by the gate on an
    explicit pass. Direct construction raises, so a clearance cannot be forged by
    calling the dataclass constructor.
    """

    content_sha256: str
    gate_version: str
    reason_code: str

    def __post_init__(self) -> None:
        if not _minting.get():
            raise PermissionError(
                "a SafetyClearance may only be minted by the safety gate on an explicit "
                "pass; construct it through the gate rather than directly. This also "
                "blocks dataclasses.replace, which would otherwise retarget a valid "
                "clearance onto different bytes."
            )

    def covers(self, data: bytes) -> bool:
        """Whether this clearance was issued for exactly these bytes."""
        return content_digest(data) == self.content_sha256


def mint_clearance(data: bytes, *, gate_version: str, reason_code: str) -> SafetyClearance:
    """Issue a clearance. Internal to the safety module by convention and by review.

    Nothing outside this module should import this. The gate calls it after a provider
    has affirmatively passed an image; there is no other legitimate caller.
    """
    with _minting_scope():
        return SafetyClearance(
            content_sha256=content_digest(data),
            gate_version=gate_version,
            reason_code=reason_code,
        )
