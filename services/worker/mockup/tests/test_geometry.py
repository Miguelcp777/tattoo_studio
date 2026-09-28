"""The geometry method must separate how ink *sits* from what ink *is* (ADR-0002, TASK-0008).

Synthetic scenes only: a smooth skin-toned gradient with pore-scale noise and a line design. The
tolerance used here is illustrative, chosen to show separation; the decided value is TASK-0008's.
"""

from __future__ import annotations

import io
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from mockup.geometry import (
    GeometryCheck,
    GeometryTolerance,
    geometry_report,
    within_tolerance,
)

SIZE = (900, 700)
BOUNDS = {"xPx": 250, "yPx": 150, "widthPx": 400, "heightPx": 400}
ILLUSTRATIVE = GeometryTolerance(max_p95_relative=0.01, min_ink_iou=0.5)
INK = (38, 32, 30)


def _skin(seed: int, noise: float = 4.0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    ys = np.linspace(0, 1, SIZE[1])[:, None, None]
    top = np.array([214, 170, 146], dtype=np.float32)
    bottom = np.array([168, 120, 98], dtype=np.float32)
    base = top + (bottom - top) * ys
    base = np.broadcast_to(base, (SIZE[1], SIZE[0], 3)).copy()
    return base + rng.normal(0, noise, base.shape)


def _scene(
    shift: tuple[int, int] = (0, 0), *, drop_line: bool = False, seed: int = 1
) -> Image.Image:
    image = Image.fromarray(np.clip(_skin(seed), 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(image)
    dx, dy = shift
    x, y = BOUNDS["xPx"] + dx, BOUNDS["yPx"] + dy
    draw.ellipse((x + 60, y + 60, x + 340, y + 340), outline=INK, width=7)
    draw.line((x + 200, y + 20, x + 200, y + 380), fill=INK, width=6)
    if not drop_line:
        draw.line((x + 20, y + 200, x + 380, y + 200), fill=INK, width=6)
    draw.polygon([(x + 170, y + 120), (x + 230, y + 120), (x + 200, y + 170)], fill=INK)
    return image


def _png(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _skin_integration(image: Image.Image) -> Image.Image:
    """What a faithful blend may do: relight, retone, soften edges, replace skin texture."""
    arr = np.asarray(image, dtype=np.float32) / 255
    relit = (arr**1.15) * 0.88 + 0.06
    ys = np.linspace(0.92, 1.05, SIZE[1])[:, None, None]
    textured = relit * ys * 255 + np.random.default_rng(9).normal(0, 5, relit.shape)
    softened = Image.fromarray(np.clip(textured, 0, 255).astype(np.uint8))
    return softened.filter(ImageFilter.GaussianBlur(0.9))


def test_identical_images_do_not_move() -> None:
    before = _png(_scene())
    report = geometry_report(before, before, BOUNDS)
    assert report.p95_px == 0
    assert report.ink_iou == 1
    assert report.reference_edges > 0
    assert within_tolerance(report, ILLUSTRATIVE)


def test_skin_integration_is_allowed() -> None:
    """Lighting, tone, texture and softening change how ink sits, not where it is."""
    before = _scene()
    report = geometry_report(_png(before), _png(_skin_integration(before)), BOUNDS)
    assert report.p95_px <= 3
    assert report.ink_iou >= 0.6
    assert within_tolerance(report, ILLUSTRATIVE)


def test_a_result_at_another_resolution_is_compared_fairly() -> None:
    before = _scene()
    smaller = before.resize((SIZE[0] // 2, SIZE[1] // 2), Image.Resampling.LANCZOS)
    report = geometry_report(_png(before), _png(smaller), BOUNDS)
    assert within_tolerance(report, ILLUSTRATIVE)


def test_a_moved_design_fails() -> None:
    report = geometry_report(_png(_scene()), _png(_scene(shift=(18, 10))), BOUNDS)
    assert report.p95_px >= 10
    assert not within_tolerance(report, ILLUSTRATIVE)


def test_a_removed_element_fails() -> None:
    """Redrawing is a change in what the ink is, even when everything else stays put."""
    report = geometry_report(_png(_scene()), _png(_scene(drop_line=True)), BOUNDS)
    assert report.p95_px >= 10
    assert not within_tolerance(report, ILLUSTRATIVE)


def test_vanished_ink_fails_rather_than_passing_by_default() -> None:
    bare = Image.fromarray(np.clip(_skin(1), 0, 255).astype(np.uint8))
    report = geometry_report(_png(_scene()), _png(bare), BOUNDS)
    assert math.isinf(report.p95_px)
    assert not within_tolerance(report, ILLUSTRATIVE)


def test_nothing_to_verify_fails() -> None:
    bare = _png(Image.fromarray(np.clip(_skin(1), 0, 255).astype(np.uint8)))
    report = geometry_report(bare, bare, BOUNDS)
    assert report.reference_edges == 0
    assert not within_tolerance(report, ILLUSTRATIVE)


def test_geometry_check_port_uses_the_method() -> None:
    check = GeometryCheck(ILLUSTRATIVE)
    before = _scene()
    assert check.within_tolerance(_png(before), _png(_skin_integration(before)), BOUNDS)
    assert not check.within_tolerance(_png(before), _png(_scene(shift=(18, 10))), BOUNDS)
