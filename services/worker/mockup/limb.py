"""Where the body is in the photograph (TASK-0039).

Placement used to assume that skin fills a fixed fraction of the frame (``SKIN_FRAME_FRACTION``).
When the leg in the picture was narrower than assumed, a whole-calf design ran off the leg and was
printed on the backdrop. This measures the body instead.

It is a silhouette, not depth: skin against a plain backdrop separates on chroma alone, and a
low-confidence reading returns ``None`` so the caller keeps the previous behaviour rather than
fitting to a guess. Deterministic and local; nothing here calls a model.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from PIL import Image, ImageFilter
from skimage.filters import threshold_otsu
from skimage.measure import label

#: Work at a quarter of the resolution: the outline of a limb does not need pores.
_SCALE = 4
#: The body must be clearly more saturated than what surrounds it.
_MIN_SEPARATION = 20.0
#: A body covering almost none or almost all of the frame is not a reading to trust.
_MIN_FRACTION, _MAX_FRACTION = 0.15, 0.95


def body_mask(photo: Image.Image) -> np.ndarray | None:
    """Boolean mask of the body at ``photo``'s size, or ``None`` when it cannot be told apart."""
    small = photo.convert("RGB").resize(
        (max(1, photo.width // _SCALE), max(1, photo.height // _SCALE)), Image.Resampling.BOX
    )
    pixels = np.asarray(small, dtype=np.float32)
    spread = Image.fromarray(
        np.clip(pixels.max(axis=2) - pixels.min(axis=2), 0, 255).astype(np.uint8)
    )
    chroma = np.asarray(spread.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)
    if float(chroma.max() - chroma.min()) < _MIN_SEPARATION:
        return None
    threshold = float(threshold_otsu(chroma))  # type: ignore[no-untyped-call]
    mask = _largest(chroma > threshold)
    if mask is None:
        return None
    mask = _morph(_morph(mask, ImageFilter.MaxFilter, 7), ImageFilter.MinFilter, 7)  # close
    mask = _fill_holes(mask)
    mask = _morph(_morph(mask, ImageFilter.MinFilter, 5), ImageFilter.MaxFilter, 5)  # open
    fraction = float(mask.mean())
    if not _MIN_FRACTION <= fraction <= _MAX_FRACTION:
        return None
    if float(chroma[mask].mean() - chroma[~mask].mean()) < _MIN_SEPARATION:
        return None
    full = Image.fromarray(mask.astype(np.uint8) * 255).resize(
        photo.size, Image.Resampling.BILINEAR
    )
    result: np.ndarray = np.asarray(full) > 127
    return result


def _morph(mask: np.ndarray, filt: Callable[[int], ImageFilter.Filter], size: int) -> np.ndarray:
    image = Image.fromarray(mask.astype(np.uint8) * 255).filter(filt(size))
    result: np.ndarray = np.asarray(image) > 127
    return result


def _largest(mask: np.ndarray) -> np.ndarray | None:
    labels = label(mask, connectivity=2)  # type: ignore[no-untyped-call]
    counts = np.bincount(labels.ravel())
    if len(counts) < 2:
        return None
    counts[0] = 0
    result: np.ndarray = labels == int(np.argmax(counts))
    return result


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """Background regions that do not reach the frame's edge are holes in the body."""
    labels = label(~mask, connectivity=1)  # type: ignore[no-untyped-call]
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    result: np.ndarray = mask | ~np.isin(labels, edge)
    return result


def centre_line(mask: np.ndarray, top: int, bottom: int) -> float | None:
    """Median horizontal centre of the body over rows ``top:bottom``."""
    centres = [
        (cols[0] + cols[-1]) / 2
        for cols in (np.flatnonzero(row) for row in mask[top:bottom])
        if len(cols)
    ]
    return float(np.median(centres)) if centres else None


def taper(mask: np.ndarray, top: int, bottom: int, limit: float) -> float | None:
    """How much the body narrows from the top to the bottom of a span, as the cylinder's taper.

    The composite's cylinder narrows as ``1 - taper * t**2``, so the ratio of the body's width at
    the bottom of the span to its width at the top is that model's ``1 - taper``.
    """
    widths = np.array(
        [
            cols[-1] - cols[0] if len(cols) else 0
            for cols in (np.flatnonzero(row) for row in mask[top:bottom])
        ],
        dtype=np.float32,
    )
    if len(widths) < 10:
        return None
    band = max(1, len(widths) // 5)
    upper, lower = float(np.median(widths[:band])), float(np.median(widths[-band:]))
    if upper <= 0:
        return None
    return min(limit, max(0.0, 1 - lower / upper))
