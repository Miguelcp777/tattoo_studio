"""Ports this module needs from modules that do not exist yet.

`generation` depends on `media` and `safety` per its spec, and neither is built
(TASK-0006, TASK-0007). Rather than write throwaway implementations — which would
pre-empt TASK-0007's security-critical design for EXIF stripping, encryption and
cascade deletion — the consumer defines the narrow port and the real module implements
it later. This keeps ARCH-INV-002 intact and means nothing here has to be rewritten
when `media` arrives.
"""

from __future__ import annotations

from typing import Protocol

from .types import ImageRef, MediaType


class MediaStore(Protocol):
    """The slice of `media` that generation needs: somewhere to put produced bytes.

    Implementations own EXIF handling, encryption at rest and retention. None of that
    is generation's business, which is exactly why this port is this narrow.
    """

    def put(
        self,
        data: bytes,
        *,
        media_type: MediaType,
        width_px: int,
        height_px: int,
        hint: str,
    ) -> ImageRef:
        """Store bytes and return an opaque handle.

        ``hint`` is a caller-supplied path fragment for readability of storage keys.
        Implementations must treat it as untrusted and must not let it escape their
        namespace.
        """
        ...
