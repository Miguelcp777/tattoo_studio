"""Value types crossing the generation boundary.

``SafetyClearance`` is re-exported from `safety`, which is the only module allowed to
mint one. It lived here during TASK-0004 purely because `safety` did not exist yet
(FINDING-0003).

Image bytes never appear here. A generated image is referred to by an opaque storage
key, so nothing large or sensitive travels through the queue (JOBS-INV-001) and no
signed URL is ever held in a domain object (SEC-INV-008).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

MediaType = Literal["image/png", "image/webp", "image/jpeg"]


@dataclass(frozen=True, slots=True)
class ImageRef:
    """A handle to stored image bytes. Mirrors the `imageRef` definition in the Design contract."""

    storage_key: str
    media_type: MediaType
    width_px: int
    height_px: int
    byte_size: int | None = None


@dataclass(frozen=True, slots=True)
class TextToImageRequest:
    """A prompt-only generation. The only shape the flash path needs."""

    prompt: str
    width_px: int
    height_px: int
    model: str
    negative_prompt: str | None = None
    seed: int | None = None
    extra: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ImageConditionedRequest:
    """A generation conditioned on an existing image.

    Reaching this type at all requires a :class:`SafetyClearance`, which cannot be
    constructed yet. It is defined now so the adapter surface is complete and the
    mockup path has somewhere to land.
    """

    prompt: str
    source: ImageRef
    strength: float
    model: str
    mask: ImageRef | None = None
    negative_prompt: str | None = None
    seed: int | None = None
    extra: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    """A normalized provider result (GEN-INV-004).

    Carries the provenance a `Design` needs: which provider and model produced it,
    from which prompt, and with which seed where the provider exposes one.
    """

    image: ImageRef
    provider: str
    model: str
    prompt: str
    negative_prompt: str | None = None
    seed: int | None = None


# Re-exported so existing call sites keep working; the type is owned by `safety`.
from safety import SafetyClearance  # noqa: E402

__all__ = [
    "GeneratedImage",
    "ImageConditionedRequest",
    "ImageRef",
    "MediaType",
    "SafetyClearance",
    "TextToImageRequest",
]
