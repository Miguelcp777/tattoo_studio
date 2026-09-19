"""A deterministic provider for tests, CI and local development.

It produces real PNG bytes rather than a placeholder, so downstream work — the stencil
tracing pass especially — has something genuine to operate on without needing
credentials or a network. The image is trivial artwork, but it is a valid image.

Determinism is the point: the same request always yields the same bytes and the same
storage key, so tests can assert on output without recording fixtures.
"""

from __future__ import annotations

import hashlib
import struct
import zlib

from .ports import MediaStore
from .provider import GenerationProvider
from .types import GeneratedImage, TextToImageRequest


def _png_chunk(tag: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + tag
        + payload
        + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    )


def render_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """Encode a solid-colour RGB PNG.

    Hand-rolled rather than pulling in an imaging library, because this module is only
    meant to stand in for a real provider. When the imaging engines arrive they will
    bring a proper library with them; this stays dependency-free until then.
    """
    if width < 1 or height < 1:
        raise ValueError("dimensions must be positive")

    row = bytes(rgb) * width
    # Each scanline is prefixed with its filter type; 0 means no filtering.
    raw = b"".join(b"\x00" + row for _ in range(height))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            _png_chunk(b"IHDR", header),
            _png_chunk(b"IDAT", zlib.compress(raw, 9)),
            _png_chunk(b"IEND", b""),
        ]
    )


class FixtureProvider(GenerationProvider):
    """Deterministic stand-in satisfying the full provider contract."""

    name = "fixture"

    def __init__(self, media_store: MediaStore, **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self._media = media_store

    def _text_to_image(self, request: TextToImageRequest) -> GeneratedImage:
        digest = hashlib.sha256(
            "|".join(
                [
                    request.prompt,
                    request.negative_prompt or "",
                    request.model,
                    str(request.width_px),
                    str(request.height_px),
                    str(request.seed if request.seed is not None else "-"),
                ]
            ).encode("utf-8")
        ).hexdigest()

        colour = (int(digest[0:2], 16), int(digest[2:4], 16), int(digest[4:6], 16))
        data = render_png(request.width_px, request.height_px, colour)

        image = self._media.put(
            data,
            media_type="image/png",
            width_px=request.width_px,
            height_px=request.height_px,
            hint=f"fixture/{digest[:12]}",
        )

        return GeneratedImage(
            image=image,
            provider=self.name,
            model=request.model,
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            # Derived from the request so it is stable and reproducible, which is what
            # a seed is for, rather than a pretence at randomness.
            seed=request.seed if request.seed is not None else int(digest[:8], 16),
        )
