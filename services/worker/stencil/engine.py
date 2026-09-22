"""Native line-art centerlines are the authoritative geometry for every delivery."""

from __future__ import annotations

import hashlib
import io
import json
import math
from dataclasses import dataclass
from itertools import pairwise

import numpy as np
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from skimage.feature import canny
from skimage.morphology import skeletonize


@dataclass
class Master:
    paths: list[list[tuple[float, float]]]
    width_mm: float
    height_mm: float
    stroke_mm: float
    source_hash: str | None = None

    @property
    def design_hash(self) -> str:
        return hashlib.sha256(json.dumps(self.__dict__, sort_keys=True).encode()).hexdigest()


def trace_native_lineart(
    data: bytes, width_mm: float, height_mm: float, stroke_mm: float = 0.3
) -> Master:
    """Threshold only the dedicated flat native line-art pass, never a shaded render."""
    with Image.open(io.BytesIO(data)) as image:
        image.thumbnail((1536, 1536))
        gray = np.asarray(image.convert("L"))
    ink = gray < 128
    fraction = float(ink.mean())
    if not 0.001 < fraction < 0.35:
        raise ValueError("El proveedor no produjo line-art limpio. Reintenta con otro diseño.")
    return _trace_mask(ink, width_mm, height_mm, stroke_mm)


def trace_colour_artwork(
    data: bytes, width_mm: float, height_mm: float, stroke_mm: float = 0.3
) -> tuple[Master, Image.Image]:
    """Derive review contours from the sole flat artwork, never from skin.

    RGB boundaries retain isoluminant colour transitions. The result is an
    approximation for tattooer review, not guaranteed semantic line selection.
    """
    with Image.open(io.BytesIO(data)) as source:
        artwork = source.convert("RGB")
        artwork.thumbnail((1536, 1536))
    rgb = np.asarray(artwork, dtype=np.float64) / 255
    edges = np.zeros(rgb.shape[:2], dtype=bool)
    for channel in range(3):
        edges |= canny(  # type: ignore[no-untyped-call]
            rgb[:, :, channel], sigma=1.2, low_threshold=0.08, high_threshold=0.2
        )
    if not 0.001 < float(edges.mean()) < 0.35:
        raise ValueError("No se pueden extraer contornos suficientes del diseño a color.")
    master = _trace_mask(edges, width_mm, height_mm, stroke_mm)
    master.source_hash = hashlib.sha256(artwork.tobytes()).hexdigest()
    # Same millimetre fit and one-millimetre margin as the vector paths.
    factor = 150 / 25.4
    preview = Image.new(
        "RGB", (math.ceil(width_mm * factor), math.ceil(height_mm * factor)), "white"
    )
    scale = min((width_mm - 2) / artwork.width, (height_mm - 2) / artwork.height)
    fitted = artwork.resize(
        (
            max(1, round(artwork.width * scale * factor)),
            max(1, round(artwork.height * scale * factor)),
        ),
        Image.Resampling.LANCZOS,
    )
    preview.paste(
        fitted,
        (
            round((width_mm - artwork.width * scale) / 2 * factor),
            round((height_mm - artwork.height * scale) / 2 * factor),
        ),
    )
    return master, preview


def _trace_mask(ink: np.ndarray, width_mm: float, height_mm: float, stroke_mm: float) -> Master:
    skel = skeletonize(ink)  # type: ignore[no-untyped-call]
    points = {(int(x), int(y)) for y, x in np.argwhere(skel)}
    if len(points) > 180_000:
        raise ValueError("Line-art demasiado complejo para un stencil fiable.")

    def neighbours(p: tuple[int, int]) -> list[tuple[int, int]]:
        x, y = p
        found = []
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            q = x + dx, y + dy
            if q not in points:
                continue
            if dx and dy and ((x + dx, y) in points or (x, y + dy) in points):
                continue
            found.append(q)
        return found

    graph = {p: neighbours(p) for p in sorted(points)}
    visited: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    paths = []
    total_length = kept_length = 0.0
    h, w = ink.shape
    scale = min((width_mm - 2) / w, (height_mm - 2) / h)
    ox, oy = (width_mm - w * scale) / 2, (height_mm - h * scale) / 2
    starts = [p for p in graph if len(graph[p]) != 2] + [p for p in graph if len(graph[p]) == 2]
    for start in starts:
        for neighbour in graph[start]:
            if (start, neighbour) in visited:
                continue
            chain = [start]
            previous, current = start, neighbour
            while True:
                visited.add((previous, current))
                visited.add((current, previous))
                chain.append(current)
                options = [q for q in graph[current] if (current, q) not in visited]
                if len(graph[current]) != 2 or not options:
                    break
                previous, current = current, options[0]
            length = sum(math.dist(a, b) for a, b in pairwise(chain)) * scale
            total_length += length
            # Preserve short edges joining junctions; dropping them disconnects the design.
            if length >= 0.6 or len(graph[chain[0]]) > 2 or len(graph[chain[-1]]) > 2:
                kept_length += length
                paths.append(
                    [(round(x * scale + ox, 4), round(y * scale + oy, 4)) for x, y in chain]
                )
    if not paths:
        raise ValueError("El trazado no contiene líneas utilizables.")
    if total_length and kept_length / total_length < 0.9:
        raise ValueError(
            "El tamaño solicitado elimina demasiados detalles. Aumenta las medidas "
            "o simplifica el diseño antes de volver a generar."
        )
    return Master(paths, width_mm, height_mm, stroke_mm)


def export_svg(master: Master, mirrored: bool = False) -> bytes:
    transform = f"translate({master.width_mm} 0) scale(-1 1)" if mirrored else ""
    paths = "".join(
        '<polyline points="' + " ".join(f"{x},{y}" for x, y in p) + '"/>' for p in master.paths
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{master.width_mm}mm" height="{master.height_mm}mm" '
        f'viewBox="0 0 {master.width_mm} {master.height_mm}">'
        f"<title>Stencil {master.design_hash}</title>"
        '<rect width="100%" height="100%" fill="#FFFFFF"/>'
        f'<g transform="{transform}" fill="none" stroke="#000000" '
        f'stroke-width="{master.stroke_mm}" stroke-linecap="round" '
        f'stroke-linejoin="round">{paths}</g></svg>'
    ).encode()


def export_pdf(master: Master, mirrored: bool = False) -> bytes:
    output = io.BytesIO()
    mm = 72 / 25.4
    page_w, page_h = max(master.width_mm + 20, 80), master.height_mm + 35
    pdf = canvas.Canvas(output, pagesize=(page_w * mm, page_h * mm), pageCompression=0)
    pdf.setTitle(f"InkCraft {master.design_hash}")
    pdf.setLineWidth(master.stroke_mm * mm)
    for points in master.paths:
        path = pdf.beginPath()
        for i, (x, y) in enumerate(points):
            px = (10 + (master.width_mm - x if mirrored else x)) * mm
            py = (page_h - 10 - y) * mm
            if i == 0:
                path.moveTo(px, py)
            else:
                path.lineTo(px, py)
        pdf.drawPath(path, stroke=1, fill=0)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(
        10 * mm, 15 * mm, f"{master.width_mm:g} x {master.height_mm:g} mm - Print 100%, no fit"
    )
    pdf.line(10 * mm, 10 * mm, 60 * mm, 10 * mm)
    pdf.drawString(10 * mm, 5 * mm, "Calibration: 50 mm | Tattooer review required")
    pdf.showPage()
    pdf.save()
    return output.getvalue()


def rasterize(master: Master, dpi: int = 150) -> Image.Image:
    factor = dpi / 25.4
    image = Image.new(
        "RGB", (math.ceil(master.width_mm * factor), math.ceil(master.height_mm * factor)), "white"
    )
    draw = ImageDraw.Draw(image)
    for points in master.paths:
        draw.line(
            [(x * factor, y * factor) for x, y in points],
            fill="black",
            width=max(1, round(master.stroke_mm * factor)),
            joint="curve",
        )
    return image
