"""Fresh-ink ring and surface attenuation (TASK-0031, ADR-0014)."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from mockup.engine import DEFAULT_FRESHNESS, DEFAULT_SURFACE, composite, surface_falloff

SIZE = {"widthMm": 120.0, "heightMm": 180.0}
PLACE = {"x": 0.2, "y": 0.15, "width": 0.6}


def skin(gradient: bool = True) -> bytes:
    """A skin-toned plate, optionally lit from the left so it has a form to read."""
    width, height = 400, 600
    base = np.zeros((height, width, 3), dtype=np.float32)
    shade = np.linspace(1.0, 0.55, width)[None, :] if gradient else np.ones((1, width))
    for channel, tone in enumerate((226.0, 190.0, 168.0)):
        base[:, :, channel] = tone * shade
    buffer = io.BytesIO()
    Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).save(buffer, format="PNG")
    return buffer.getvalue()


def artwork(grey: int = 110) -> Image.Image:
    """Mid-grey strokes: solid black would hide the very tint being asserted on."""
    master = Image.new("RGB", (300, 450), "white")
    draw = ImageDraw.Draw(master)
    draw.ellipse((60, 90, 240, 360), outline=(grey, grey, grey), width=26)
    return master


def _morph(mask: np.ndarray, size: int, filt: type) -> np.ndarray:
    image = Image.fromarray((mask * 255).astype(np.uint8)).filter(filt(size))
    return np.asarray(image) > 127


def eroded(mask: np.ndarray, size: int) -> np.ndarray:
    """The inside of a stroke, away from its antialiased edge."""
    return _morph(mask, size, ImageFilter.MinFilter)


def dilated(mask: np.ndarray, size: int) -> np.ndarray:
    return _morph(mask, size, ImageFilter.MaxFilter)


def rendered(data: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(data)) as image:
        return np.asarray(image.convert("RGB"), dtype=np.float32)


def test_the_ring_reddens_skin_around_the_ink_and_not_the_ink() -> None:
    """TASK-0031/AC-001: a fresh tattoo irritates the skin, not the pigment."""
    background = skin(gradient=False)
    plain, _ = composite(artwork(), background, SIZE, PLACE, surface=0)
    fresh, meta = composite(artwork(), background, SIZE, PLACE, fresh=True, surface=0)
    before, after = rendered(plain), rendered(fresh)

    ink = before.min(axis=2) < 150
    redness = (after[:, :, 0] - after[:, :, 2]) - (before[:, :, 0] - before[:, :, 2])
    # Three regions: the stroke's core, the band just outside it, and skin further away. The
    # antialiased boundary belongs to neither core nor band, so it is excluded from both.
    core = eroded(ink, 9)
    band = dilated(ink, 11) & ~dilated(ink, 3)
    assert band.any() and core.any()
    assert redness[band].max() > 8, "the skin just outside the strokes must redden"
    assert redness[core].mean() < 1.0, "the pigment itself must stay neutral"
    assert redness[core].mean() < redness[band].mean()
    assert meta["freshness"] == DEFAULT_FRESHNESS


def test_attenuation_never_moves_a_pixel_of_the_artwork() -> None:
    """TASK-0031/AC-002 and MOCKUP-INV-001: the artwork's geometry is authoritative."""
    background = skin()
    flat, flat_meta = composite(artwork(), background, SIZE, PLACE, surface=0)
    curved, curved_meta = composite(artwork(), background, SIZE, PLACE, surface=DEFAULT_SURFACE)

    ink_flat = rendered(flat).min(axis=2) < 200
    ink_curved = rendered(curved).min(axis=2) < 200
    overlap = (ink_flat & ink_curved).sum() / max(1, ink_flat.sum())
    assert overlap > 0.97, f"the design moved: only {overlap:.2%} of it stayed put"
    assert flat_meta["widthPx"] == curved_meta["widthPx"]
    assert curved_meta["surface"] == DEFAULT_SURFACE
    assert "surface" not in flat_meta


def test_attenuation_follows_the_photograph_s_own_shading() -> None:
    """TASK-0031/AC-003: the falloff is read from the skin, not assumed.

    Asserted on the falloff itself rather than on rendered pixels: the plate is darker on the
    shadowed side, so rendered differences there confound the effect with the plate's gradient.
    """
    width = 400
    patch = np.zeros((600, width, 3), dtype=np.float32)
    shade = np.linspace(1.0, 0.55, width)[None, :]
    for channel, tone in enumerate((226.0, 190.0, 168.0)):
        patch[:, :, channel] = tone * shade

    falloff = surface_falloff(patch, 0.6)
    lit, shadowed = falloff[:, : width // 4].mean(), falloff[:, -width // 4 :].mean()
    assert lit > shadowed, "the side turning away must be attenuated more"
    assert lit == pytest.approx(1.0, abs=0.05), "the lit side is barely touched"
    assert 0.0 <= falloff.min() <= shadowed < 1.0


def test_attenuation_lightens_the_ink_overall() -> None:
    background = skin()
    flat = rendered(composite(artwork(), background, SIZE, PLACE, surface=0)[0])
    curved = rendered(composite(artwork(), background, SIZE, PLACE, surface=0.6)[0])
    ink = flat.min(axis=2) < 150
    assert (curved - flat)[ink].mean() > 0, "attenuated ink must read lighter, never darker"


def test_a_flat_plate_has_no_form_to_read() -> None:
    patch = np.full((60, 60, 3), 180.0, dtype=np.float32)
    falloff = surface_falloff(patch, 0.5)
    assert falloff.shape == (60, 60)
    assert np.allclose(falloff, 1.0, atol=1e-3), "uniform skin must not be attenuated"


def test_a_black_plate_does_not_divide_by_zero() -> None:
    assert np.allclose(surface_falloff(np.zeros((40, 40, 3), dtype=np.float32), 0.5), 1.0)


def test_the_surface_term_is_bounded() -> None:
    with pytest.raises(ValueError, match="superficie"):
        composite(artwork(), skin(), SIZE, PLACE, surface=1.5)
    with pytest.raises(ValueError, match="superficie"):
        composite(artwork(), skin(), SIZE, PLACE, surface=-0.1)
