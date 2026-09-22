"""Geometric-only placement; no generative modification of the design."""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from PIL import Image, ImageFilter


def visible_artwork(master: Image.Image) -> tuple[Image.Image, dict[str, int]]:
    """Remove only exterior white padding for uncalibrated projection; never edit the master."""
    rgb = master.convert("RGB")
    mask = np.asarray(rgb).min(axis=2) < 245
    rows, cols = np.nonzero(mask)
    if not len(rows):
        raise ValueError("El dibujo no contiene tinta visible.")
    margin = max(2, round(min(rgb.size) * 0.01))
    left, top = max(0, int(cols.min()) - margin), max(0, int(rows.min()) - margin)
    right, bottom = (
        min(rgb.width, int(cols.max()) + margin + 1),
        min(rgb.height, int(rows.max()) + margin + 1),
    )
    return rgb.crop((left, top, right, bottom)), {
        "left": left,
        "top": top,
        "width": right - left,
        "height": bottom - top,
    }


def visible_size(master: Image.Image, size: dict[str, float]) -> dict[str, float]:
    art, _ = visible_artwork(master)
    return {"widthMm": size["heightMm"] * art.width / art.height, "heightMm": size["heightMm"]}


def composite(
    master: Image.Image,
    background: bytes,
    size: dict[str, float],
    placement: dict[str, float] | None = None,
    *,
    fresh: bool = False,
    curvature: float = 0.0,
    taper: float = 0.0,
    fit_visible: bool = False,
) -> tuple[bytes, dict[str, Any]]:
    with Image.open(io.BytesIO(background)) as source:
        photo = source.convert("RGB")
        photo.thumbnail((2048, 2048))
    p = placement or {"x": 0.32, "y": 0.22, "width": 0.36}
    crop = None
    if fit_visible and not p.get("photoWidthMm"):
        master, crop = visible_artwork(master)
        size = {
            "widthMm": size["heightMm"] * master.width / master.height,
            "heightMm": size["heightMm"],
        }
    width = (
        round(photo.width * size["widthMm"] / p["photoWidthMm"])
        if p.get("photoWidthMm")
        else round(photo.width * p["width"])
    )
    height = round(width * size["heightMm"] / size["widthMm"])
    x, y = round(photo.width * p["x"]), round(photo.height * p["y"])
    if width < 2 or height < 2 or x + width > photo.width or y + height > photo.height:
        raise ValueError(
            "El diseño queda fuera de la fotografía. Ajusta posición, anchura o calibración."
        )
    ink_image = master.resize((width, height), Image.Resampling.LANCZOS).convert("RGB")
    if not 0 <= curvature <= 1.2 or not 0 <= taper <= 0.35:
        raise ValueError("Curvatura fuera del rango admitido.")
    if curvature:
        # Tapered cylindrical approximation. The source artwork remains untouched.
        mesh = []

        def source_point(px: int, py: int) -> tuple[float, float]:
            t = py / height
            radius = 1 - taper * t * t
            u = (2 * px / width - 1) / radius
            # Continue beyond the image edge so PIL fills exposed margins white.
            sx = math.asin(max(-1, min(1, u)) * math.sin(curvature)) / curvature
            sx += max(0, abs(u) - 1) * (1 if u > 0 else -1)
            bow = 0.035 * height * math.sin(curvature) * (1 - min(1, u * u))
            sy = py - bow * math.sin(math.pi * t)
            return (sx + 1) * width / 2, sy

        for top in range(0, height, max(1, height // 48)):
            bottom = min(height, top + max(1, height // 48))
            for left in range(0, width, max(1, width // 48)):
                right = min(width, left + max(1, width // 48))
                quad = (
                    *source_point(left, top),
                    *source_point(left, bottom),
                    *source_point(right, bottom),
                    *source_point(right, top),
                )
                mesh.append(((left, top, right, bottom), quad))
        ink_image = ink_image.transform(
            (width, height),
            Image.Transform.MESH,
            mesh,
            Image.Resampling.BICUBIC,
            fillcolor="white",
        )
    if fresh:
        ink_image = ink_image.filter(ImageFilter.GaussianBlur(0.3))
    ink = np.asarray(ink_image, dtype=np.float32) / 255
    pixels = np.asarray(photo, dtype=np.float32).copy()
    patch = pixels[y : y + height, x : x + width]
    if fresh:
        coverage = 1 - ink.min(axis=2)
        # Dilate before blurring: redness must surround ink, not disappear beneath it.
        halo_radius = max(1, min(9, round(width * 0.009)))
        halo = (
            np.asarray(
                Image.fromarray((coverage * 255).astype(np.uint8))
                .filter(ImageFilter.MaxFilter(halo_radius * 2 + 1))
                .filter(ImageFilter.GaussianBlur(max(1.2, width * 0.008))),
                dtype=np.float32,
            )
            / 255
        )
        warm = patch.copy()
        warm[:, :, 0] += (255 - warm[:, :, 0]) * halo * 0.14
        warm[:, :, 1] *= 1 - halo * 0.095
        warm[:, :, 2] *= 1 - halo * 0.065
        pigment = warm * (0.07 + 0.93 * ink)
        sheen = 255 * 0.025 * coverage[:, :, None] * (patch / 255) ** 4
        pixels[y : y + height, x : x + width] = pigment + sheen
    else:
        patch *= 0.15 + 0.85 * ink
    result = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))
    output = io.BytesIO()
    result.save(output, format="PNG")
    return output.getvalue(), {
        "xPx": x,
        "yPx": y,
        "widthPx": width,
        "heightPx": height,
        "method": "fresh-ink-composite" if fresh else "geometric-multiply",
        **({"curvature": curvature} if curvature else {}),
        **({"taper": taper} if taper else {}),
        **({"sourceCropPx": crop} if crop else {}),
        "scaleCalibrated": bool(p.get("photoWidthMm")),
        "generativePostprocess": False,
    }
