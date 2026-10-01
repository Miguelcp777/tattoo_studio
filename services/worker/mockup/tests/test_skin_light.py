"""TASK-0063: the skin's surface light passes over the ink."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from mockup.engine import composite, skin_light

SKIN = (190, 145, 120)


def plate(gloss: bool) -> bytes:
    """Even skin, or the same skin with a soft bright gloss on its left half."""
    image = Image.new("RGB", (400, 600), SKIN)
    if gloss:
        shine = Image.new("L", (400, 600), 0)
        ImageDraw.Draw(shine).ellipse((60, 160, 180, 440), fill=70)
        shine = shine.filter(ImageFilter.GaussianBlur(18))
        lit = np.asarray(image, dtype=np.float32) + np.asarray(shine, dtype=np.float32)[:, :, None]
        image = Image.fromarray(np.clip(lit, 0, 255).astype(np.uint8))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def black_square() -> Image.Image:
    return Image.new("RGB", (100, 100), "black")


def render(background: bytes) -> tuple[np.ndarray, dict[str, int]]:
    data, transform = composite(
        black_square(),
        background,
        {"widthMm": 100, "heightMm": 100},
        {"x": 0.05, "y": 0.2, "width": 0.9},
        fresh=True,
        freshness=0.0,
    )
    return np.asarray(Image.open(io.BytesIO(data)), dtype=np.float32), transform


def test_even_skin_reflects_nothing_extra() -> None:
    patch = np.full((50, 50, 3), SKIN, dtype=np.float32)
    assert float(np.abs(skin_light(patch)).max()) == 0.0


def test_on_even_skin_the_ink_is_what_it_was() -> None:
    image, t = render(plate(gloss=False))
    centre = image[t["yPx"] + t["heightPx"] // 2, t["xPx"] + t["widthPx"] // 2]
    # The pre-TASK-0063 composite: the skin times the pigment's 0.07 floor.
    assert np.allclose(centre, np.array(SKIN) * 0.07, atol=1.0)


def test_a_gloss_on_the_skin_shows_through_black_ink() -> None:
    glossy, t = render(plate(gloss=True))
    bare = np.asarray(Image.open(io.BytesIO(plate(gloss=True))), dtype=np.float32)
    row = t["yPx"] + t["heightPx"] // 2
    shine_x, matte_x = 120, 300  # inside the ellipse, and far from it
    skin_step = bare[row, shine_x].mean() - bare[row, matte_x].mean()
    ink_step = glossy[row, shine_x].mean() - glossy[row, matte_x].mean()
    assert skin_step > 30
    # A plain multiply passes only 7 % of it; the surface light carries several times that.
    assert ink_step > 3 * 0.07 * skin_step


def test_only_the_inked_area_changes() -> None:
    background = plate(gloss=True)
    image, t = render(background)
    bare = np.asarray(Image.open(io.BytesIO(background)), dtype=np.float32)
    above = slice(0, t["yPx"] - 2)
    assert np.array_equal(image[above], bare[above])
