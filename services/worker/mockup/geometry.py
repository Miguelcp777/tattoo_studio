"""Design-geometry comparison for the constrained AI blend (MOCKUP-INV-002, ADR-0002, TASK-0008).

A blend may change how the ink *sits* — lighting, skin texture, subsurface softening, edge
settling — but never what the ink *is*. This module measures the second without being fooled by
the first:

1. Only the placed design region is compared: the composite's recorded pixel bounds, plus a margin.
2. Each image is normalised against a heavily blurred copy of itself, which removes lighting and
   tone changes. Ink is found as "darker than the skin around it", in each image independently.
3. The ink outlines are compared with a symmetric nearest-edge distance. The 95th percentile is
   reported rather than the mean, so a few texture specks cannot hide a moved element and a single
   stray pixel cannot fail a faithful blend. Ink-mask overlap (IoU) is reported alongside.

`GeometryTolerance` has no default; `BLEND_TOLERANCE` is the one value decided so far, by TASK-0040
measurement, and is named rather than implied. Anything the method cannot verify — no
ink in the reference, ink gone from the result — reports an infinite displacement and fails, so an
unverifiable blend can never pass by default.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image, ImageFilter
from skimage.measure import label

#: Below this local contrast (grey levels) a region is treated as bare skin, not ink.
MIN_INK_CONTRAST = 10.0

#: Edge points are subsampled to at most this many per image to bound the pairwise distance cost.
MAX_EDGE_POINTS = 4000

#: Fraction of the design bounds added on each side, so a design that moved is still in view.
REGION_MARGIN = 0.1

#: TASK-0087: the local check divides the compared region into this many tiles per side, and
#: judges only tiles where the reference has at least this fraction of ink.
TILE_GRID = 4
MIN_TILE_INK = 0.02


@dataclass(frozen=True)
class GeometryReport:
    """How far the design's ink outlines moved between the pre-blend warp and the blend."""

    p95_px: float
    max_px: float
    #: ``p95_px`` as a fraction of the design's diagonal, so one tolerance fits every size.
    p95_relative: float
    ink_iou: float
    #: Outline pixels found in the reference. Zero means there was nothing to verify against.
    reference_edges: int
    #: TASK-0087 (audit ARQ-02): the lowest ink IoU over the inked tiles of a grid on the design.
    #: A small emblem or a letter redrawn barely moves the global numbers; it empties its tile.
    worst_tile_iou: float = 1.0


@dataclass(frozen=True)
class GeometryTolerance:
    """The pass condition. Its values are TASK-0008's output; there is no default on purpose."""

    max_p95_relative: float
    min_ink_iou: float
    #: TASK-0087: the local limit. Zero checks nothing locally.
    min_tile_iou: float = 0.0


#: Calibrated in TASK-0040 on the live Mestalla composite (1024 x 1536, design 640 x 1136 px).
#: GPT-Image edits, four runs: p95 0.0093-0.0158 of the diagonal, ink IoU 0.683-0.772, all visibly
#: faithful (the worst only darkened the tone). FLUX.2 edits, two runs: p95 0.0199-0.0208, IoU
#: 0.477-0.532, with ornaments and the crest's outline redrawn. The limits sit between the two.
#: One design is a thin corpus: revisit when more designs have been measured (ADR-0018).
#: TASK-0087 (audit ARQ-02): the local limit comes from the synthetic corpus (`mockup.corpus`: four
#: designs, three skin tones, three finish strengths, four kinds of redraw). Faithful finishes kept
#: a worst tile IoU of 0.231 or more; every redraw — a small emblem redrawn or dropped, one letter
#: changed, the design shifted — fell to 0.202 or less, fourteen of 39 past the global limits
#: alone. 0.21 sits between with a thin margin: recalibrate against real finishes.
BLEND_TOLERANCE = GeometryTolerance(max_p95_relative=0.018, min_ink_iou=0.62, min_tile_iou=0.21)


def _region(transform: dict[str, Any], width: int, height: int) -> tuple[int, int, int, int]:
    x, y = int(transform["xPx"]), int(transform["yPx"])
    w, h = int(transform["widthPx"]), int(transform["heightPx"])
    mx, my = round(w * REGION_MARGIN), round(h * REGION_MARGIN)
    return max(0, x - mx), max(0, y - my), min(width, x + w + mx), min(height, y + h + my)


def ink_mask(gray: np.ndarray) -> np.ndarray:
    """Pixels markedly darker than their surrounding skin, with tiny specks removed."""
    height, width = gray.shape
    radius = max(6.0, min(width, height) / 10)
    background = np.asarray(
        Image.fromarray(np.clip(gray, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(radius)
        ),
        dtype=np.float32,
    )
    residual = gray - background
    strongest = -float(np.percentile(residual, 0.5))
    if strongest < MIN_INK_CONTRAST:
        return np.zeros_like(gray, dtype=bool)
    mask: np.ndarray = residual < -max(MIN_INK_CONTRAST, 0.35 * strongest)
    components = label(mask, connectivity=2)  # type: ignore[no-untyped-call]
    sizes = np.bincount(components.ravel())
    keep = sizes >= max(8, int(mask.size * 0.0002))
    keep[0] = False
    kept: np.ndarray = keep[components]
    return kept


def _outline(mask: np.ndarray) -> np.ndarray:
    """Boundary pixels: in the mask with at least one 4-neighbour outside it."""
    padded = np.pad(mask, 1, constant_values=False)
    interior = (
        padded[1:-1, 1:-1]
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )
    outline: np.ndarray = mask & ~interior
    return outline


def _points(outline: np.ndarray) -> np.ndarray:
    rows, cols = np.nonzero(outline)
    points = np.stack([rows, cols], axis=1).astype(np.float32)
    if len(points) > MAX_EDGE_POINTS:
        points = points[:: math.ceil(len(points) / MAX_EDGE_POINTS)]
    return points


def _nearest(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    """Distance from each source point to its nearest target point, in bounded memory."""
    out = np.empty(len(source), dtype=np.float32)
    for start in range(0, len(source), 512):
        chunk = source[start : start + 512]
        d2 = ((chunk[:, None, :] - target[None, :, :]) ** 2).sum(axis=2)
        out[start : start + 512] = np.sqrt(d2.min(axis=1))
    return out


def _gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.float32)


def worst_tile_iou(reference: np.ndarray, candidate: np.ndarray) -> float:
    """The lowest ink IoU among the tiles where the reference has ink (TASK-0087)."""
    height, width = reference.shape
    worst = 1.0
    for row in range(TILE_GRID):
        for col in range(TILE_GRID):
            top, bottom = row * height // TILE_GRID, (row + 1) * height // TILE_GRID
            left, right = col * width // TILE_GRID, (col + 1) * width // TILE_GRID
            a = reference[top:bottom, left:right]
            if not a.size or a.mean() < MIN_TILE_INK:
                continue
            b = candidate[top:bottom, left:right]
            union = int((a | b).sum())
            worst = min(worst, float((a & b).sum()) / union if union else 0.0)
    return worst


def geometry_report(before: bytes, after: bytes, transform: dict[str, Any]) -> GeometryReport:
    """Compare the design region of the pre-blend warp (``before``) with the blend (``after``).

    ``transform`` is the one ``composite`` recorded for ``before``. A result at another resolution
    is scaled back to ``before``'s size first; any distortion that introduces is itself measured.
    """
    with Image.open(io.BytesIO(before)) as source:
        reference = source.convert("RGB")
    with Image.open(io.BytesIO(after)) as source:
        candidate = source.convert("RGB")
    if candidate.size != reference.size:
        candidate = candidate.resize(reference.size, Image.Resampling.LANCZOS)
    left, top, right, bottom = _region(transform, *reference.size)
    box = (left, top, right, bottom)
    mask_a = ink_mask(_gray(reference.crop(box)))
    mask_b = ink_mask(_gray(candidate.crop(box)))
    points_a, points_b = _points(_outline(mask_a)), _points(_outline(mask_b))
    union = int((mask_a | mask_b).sum())
    iou = float((mask_a & mask_b).sum()) / union if union else 0.0
    diagonal = math.hypot(float(transform["widthPx"]), float(transform["heightPx"]))
    tile = worst_tile_iou(mask_a, mask_b)
    if not len(points_a) or not len(points_b):
        return GeometryReport(math.inf, math.inf, math.inf, iou, len(points_a), tile)
    distances = np.concatenate([_nearest(points_a, points_b), _nearest(points_b, points_a)])
    p95 = float(np.percentile(distances, 95))
    return GeometryReport(
        p95_px=p95,
        max_px=float(distances.max()),
        p95_relative=p95 / diagonal if diagonal else math.inf,
        ink_iou=iou,
        reference_edges=len(points_a),
        worst_tile_iou=tile,
    )


def within_tolerance(report: GeometryReport, tolerance: GeometryTolerance) -> bool:
    """Pass only a verifiable report inside both limits."""
    return (
        report.reference_edges > 0
        and math.isfinite(report.p95_relative)
        and report.p95_relative <= tolerance.max_p95_relative
        and report.ink_iou >= tolerance.min_ink_iou
        and report.worst_tile_iou >= tolerance.min_tile_iou
    )


class GeometryCheck:
    """The orchestration graph's geometry check, backed by this method and a decided tolerance."""

    def __init__(self, tolerance: GeometryTolerance) -> None:
        self.tolerance = tolerance

    def within_tolerance(self, warped: bytes, blended: bytes, transform: dict[str, Any]) -> bool:
        return within_tolerance(geometry_report(warped, blended, transform), self.tolerance)
