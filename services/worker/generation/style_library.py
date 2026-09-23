"""Generate the style catalogue images (TASK-0028, ADR-0012).

Run once, not per request. The output is committed and served as static assets, so a client
choosing between three tribal variants costs nothing and waits for nothing.

This lives in ``generation`` because it makes outbound model calls, and ARCH-INV-001 confines
those to this module and ``safety``. A runner under ``scripts/`` would violate it.

Why generated rather than photographed: a real tattoo photograph is someone's copyrighted work,
often in a recognisable artist's hand, and feeding it to a generator as a reference is a worse
version of the imitation PROD-INV-004 forbids. These are illustrative renders and are labelled
as such wherever they are shown.

The provider is injected rather than built here: ``generation`` may not import ``app``, which
is the composition root and already depends on this module. ``app.build_style_library`` is the
runner.
"""

from __future__ import annotations

import io
import json
from collections.abc import Callable
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any, Protocol

from PIL import Image

#: Catalogue thumbnails. Large enough to judge a style, small enough to commit 48 of them.
THUMBNAIL = (512, 768)
WEBP_QUALITY = 82


def catalogue() -> dict[str, Any]:
    document: dict[str, Any] = json.loads(
        resources.files("tattoo_contracts.reference")
        .joinpath("style-library.json")
        .read_text("utf-8")
    )
    return document


def variant_prompt(style_phrase: str, characteristics: str) -> str:
    """A catalogue image is a tattoo on skin, which is what the client is choosing between."""
    return (
        "Photograph of one finished tattoo on bare adult skin, filling the frame. "
        f"{style_phrase}. {characteristics}. "
        "Studio lighting, sharp focus, plain neutral background. "
        "No face, no nudity, no text, no watermark, no signature, no hands holding anything."
    )


@dataclass(frozen=True)
class Job:
    style: str
    variant: str
    prompt: str

    @property
    def relative_path(self) -> Path:
        return Path(self.style) / f"{self.variant}.webp"


def jobs(document: dict[str, Any], only: str | None) -> list[Job]:
    planned: list[Job] = []
    for style, entry in document["styles"].items():
        if only and style != only:
            continue
        for variant in entry["variants"]:
            planned.append(
                Job(
                    style,
                    variant["id"],
                    variant_prompt(entry["phrase"], variant["characteristics"]),
                )
            )
    if only and not planned:
        raise SystemExit(f"unknown style {only!r}; known: {', '.join(document['styles'])}")
    return planned


def thumbnail(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as source:
        image = source.convert("RGB")
        image.thumbnail(THUMBNAIL, Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=6)
        return buffer.getvalue()


class ImageBackend(Protocol):
    """The one capability this needs, so the caller owns provider construction."""

    def flux(
        self, model: str, prompt: str, images: list[bytes], size: tuple[int, int]
    ) -> bytes: ...


def generate(
    backend: ImageBackend,
    model: str,
    out: Path,
    planned: list[Job],
    *,
    report: Callable[[str], None] = print,
) -> list[tuple[Job, str]]:
    """Generate each planned image, returning the failures rather than raising on the first.

    One bad variant must not discard the paid work that already succeeded.
    """
    failures: list[tuple[Job, str]] = []
    for index, job in enumerate(planned, start=1):
        target = out / job.relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        report(f"[{index}/{len(planned)}] {job.style}/{job.variant} ...")
        try:
            raw = backend.flux(model, job.prompt, [], (1024, 1536))
        except Exception as error:
            failures.append((job, f"{type(error).__name__}: {error}"))
            report(f"    FAILED {job.style}/{job.variant}")
            continue
        data = thumbnail(raw)
        target.write_bytes(data)
        report(f"    wrote {target.name}, {len(data) // 1024} KiB")
    return failures


def pending(out: Path, planned: list[Job], *, force: bool = False) -> list[Job]:
    """Resumable by default: a failure halfway must not re-spend on what already succeeded."""
    return [job for job in planned if force or not (out / job.relative_path).exists()]
