"""Value types crossing the generation boundary.

Image bytes never appear here. A generated image is referred to by an opaque storage
key, so nothing large or sensitive travels through the queue (JOBS-INV-001) and no
signed URL is ever held in a domain object (SEC-INV-008).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .errors import SafetyGateUnavailableError

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


class SafetyClearance:
    """Proof that an image passed the safety input gate.

    **This type cannot be constructed.** Image-conditioned generation requires an
    instance, and no code path can produce one while the safety module does not exist,
    so the photo path is unreachable rather than merely guarded (SEC-INV-007).

    That is deliberate. A runtime ``if`` guarding the photo path could be deleted by a
    later refactor without any test noticing; an uninstantiable argument type cannot.

    TASK-0007 introduces the safety module and, with it, the only legitimate way to
    mint a clearance: after ``screen_upload`` has actually passed. Until then, every
    attempt raises.
    """

    __slots__ = ("gate_version", "image_key")

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        raise SafetyGateUnavailableError(
            "image-conditioned generation requires a safety clearance, and the safety "
            "module does not exist yet; refusing rather than proceeding",
            provider="<none>",
        )
