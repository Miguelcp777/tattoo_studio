"""The mockup fits the body in the photograph (TASK-0039)."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from mockup import limb
from mockup.engine import MAX_SPILL, composite

SIZE = {"widthMm": 140.0, "heightMm": 250.0}
#: The old assumed framing: wider than the leg drawn below, like the live failure.
WIDE = {"x": 0.12, "y": 0.05, "width": 0.76}
BACKDROP = (128, 126, 124)


def leg(offset: int = 0) -> bytes:
    """A skin-toned lower leg narrowing towards the ankle, on a neutral studio backdrop."""
    photo = Image.new("RGB", (400, 600), BACKDROP)
    ImageDraw.Draw(photo).polygon(
        [(110 + offset, 0), (300 + offset, 0), (260 + offset, 600), (150 + offset, 600)],
        fill=(205, 150, 115),
    )
    buffer = io.BytesIO()
    photo.save(buffer, format="PNG")
    return buffer.getvalue()


def artwork() -> Image.Image:
    """A solid slab of ink: every pixel of it must land somewhere."""
    return Image.new("RGB", (300, 800), (40, 40, 40))


def pixels(data: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(data)) as image:
        return np.asarray(image.convert("RGB"), dtype=np.float32)


def backdrop_mask(data: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(data)) as image:
        found = limb.body_mask(image.convert("RGB"))
    assert found is not None
    return ~found


def test_the_body_is_found_on_a_studio_backdrop() -> None:
    with Image.open(io.BytesIO(leg())) as photo:
        mask = limb.body_mask(photo.convert("RGB"))
    assert mask is not None
    # The leg spans 110..300 at the top and 150..260 at the bottom.
    assert abs(int(np.flatnonzero(mask[20])[0]) - 111) <= 6
    assert abs(int(np.flatnonzero(mask[580])[-1]) - 259) <= 6


def test_no_body_is_claimed_on_a_uniform_photo() -> None:
    plain = Image.new("RGB", (400, 600), (205, 150, 115))
    assert limb.body_mask(plain) is None


def test_ink_never_lands_on_the_backdrop() -> None:
    """AC: the live failure — a whole-calf design printed past the leg — cannot recur."""
    background = leg()
    outside = backdrop_mask(background)
    before = pixels(background)

    unfitted, _ = composite(artwork(), background, SIZE, WIDE, curvature=1.05, taper=0.25)
    spilled = np.abs(pixels(unfitted) - before).max(axis=2) > 12
    assert (spilled & outside).sum() > 1000  # the old behaviour, reproduced

    fitted, meta = composite(
        artwork(), background, SIZE, WIDE, fresh=True, curvature=1.05, taper=0.25, fit_body=True
    )
    changed = np.abs(pixels(fitted) - before).max(axis=2) > 12
    assert (changed & outside).sum() == 0
    # A solid slab this wide cannot fit a leg this narrow: shrinking stops at the floor and the
    # clip keeps the backdrop clean regardless.
    assert meta["bodyFit"]["scale"] < 1


def test_a_design_that_can_fit_is_shrunk_until_it_does() -> None:
    _, meta = composite(
        artwork(),
        leg(),
        SIZE,
        {"x": 0.2, "y": 0.05, "width": 0.55},
        curvature=1.05,
        taper=0.25,
        fit_body=True,
    )
    assert meta["bodyFit"]["scale"] < 1
    assert meta["bodyFit"]["spill"] <= MAX_SPILL


def test_the_design_follows_the_leg() -> None:
    """Centred on the limb wherever it is, and tapered with it."""
    for offset in (-40, 40):
        _, meta = composite(
            artwork(), leg(offset), SIZE, WIDE, curvature=1.05, taper=0.0, fit_body=True
        )
        centre = meta["xPx"] + meta["widthPx"] / 2
        assert abs(centre - (205 + offset)) <= 8
        # The drawn leg narrows by about 40 % from top to bottom.
        assert 0.2 <= meta["taper"] <= 0.35


def test_a_calibrated_photo_keeps_its_scale() -> None:
    """Millimetres the client measured are not second-guessed; only the clip applies."""
    calibrated = {"x": 0.12, "y": 0.1, "photoWidthMm": 220.0}
    _, plain = composite(artwork(), leg(), SIZE, calibrated, curvature=1.05, taper=0.25)
    _, fitted = composite(
        artwork(), leg(), SIZE, calibrated, curvature=1.05, taper=0.25, fit_body=True
    )
    assert fitted["widthPx"] == plain["widthPx"]
    assert fitted["bodyFit"]["scale"] == 1.0


def test_without_a_readable_body_nothing_changes() -> None:
    plain = io.BytesIO()
    Image.new("RGB", (400, 600), (205, 150, 115)).save(plain, format="PNG")
    base, _ = composite(artwork(), plain.getvalue(), SIZE, WIDE, curvature=1.05, taper=0.25)
    same, fitted = composite(
        artwork(), plain.getvalue(), SIZE, WIDE, curvature=1.05, taper=0.25, fit_body=True
    )
    assert base == same
    assert "bodyFit" not in fitted


def test_a_wider_spill_margin_fills_more_of_the_limb(monkeypatch: pytest.MonkeyPatch) -> None:
    """TASK-0041: raising MAX_SPILL keeps a whole-zone design larger, so it fills more of the limb.

    A limb wraps, so the outermost ink is hidden round its side; the feathered clip keeps the edge
    clean either way. Mechanism, not a pixel proxy: same design, two tolerances, the looser one
    keeps a larger design."""
    import mockup.engine as engine

    # A tall oval a little wider than the drawn leg: at full size it spills in the 2-12 % band, so
    # the two tolerances settle at different scales (a full slab would hit the floor at both).
    design = Image.new("RGB", (300, 800), "white")
    ImageDraw.Draw(design).ellipse((40, 20, 260, 780), fill=(40, 40, 40))
    background = leg()
    monkeypatch.setattr(engine, "MAX_SPILL", 0.02)
    _, strict = composite(design, background, SIZE, WIDE, curvature=1.05, taper=0.25, fit_body=True)
    monkeypatch.setattr(engine, "MAX_SPILL", 0.12)
    _, loose = composite(design, background, SIZE, WIDE, curvature=1.05, taper=0.25, fit_body=True)
    assert loose["bodyFit"]["scale"] > strict["bodyFit"]["scale"]
    assert loose["heightPx"] > strict["heightPx"]
    # Even at the looser margin nothing is printed on the backdrop.
    fitted, _ = composite(design, background, SIZE, WIDE, curvature=1.05, taper=0.25, fit_body=True)
    changed = np.abs(pixels(fitted) - pixels(background)).max(axis=2) > 12
    assert (changed & backdrop_mask(background)).sum() == 0
