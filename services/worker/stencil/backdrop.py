"""Remove a backdrop the image model painted behind the design (TASK-0089).

The artwork is asked for on pure white, because white is what the compositor leaves as bare skin:
everything darker becomes ink. A model sometimes paints the motif inside a grey or tinted panel
instead — a biomechanical piece arrived on a grey gradient card — and the whole panel was then
tattooed onto the skin as a grey rectangle, and traced into the stencil.

A backdrop is told from the design by where it is and how it changes: it reaches the image border,
it changes smoothly from pixel to pixel, and it is light or mid-toned. It is grown from the border
through pixels that differ little from their neighbour and stay close to the border's own colour,
so it stops at the design's contours. Only a backdrop that covers a large share of the image is
cleared to white; a white one is left as it is, and so is a dark field (a blackwork piece's black
ground is the design, not a backdrop).
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image
from skimage.measure import label
from skimage.morphology import closing, footprint_rectangle

#: The border must be at least this light (0-255) to be a backdrop rather than a dark design field.
MIN_BACKDROP_LUMA = 95.0
#: A border this close to white is already what the compositor expects: nothing to clear.
WHITE_LUMA = 240.0
#: How far (per channel) a backdrop pixel may be from the border's median colour.
COLOUR_TOLERANCE = 42.0
#: Largest step (per channel) between neighbouring backdrop pixels: a gradient, not a contour.
STEP_TOLERANCE = 10.0
#: The backdrop must cover this share of the image to be cleared.
MIN_SHARE = 0.15
#: The comparison runs at this size; the mask is scaled back to the artwork's own.
WORK_SIZE = 512


def backdrop_mask(rgb: np.ndarray) -> np.ndarray:
    """Pixels of a smooth, light, border-connected backdrop; all False when there is none."""
    image = rgb.astype(np.float32)
    height, width = image.shape[:2]
    border = np.concatenate([image[0], image[-1], image[:, 0], image[:, -1]])
    median = np.median(border, axis=0)
    luma = float(median @ np.array([0.299, 0.587, 0.114]))
    if luma >= WHITE_LUMA or luma < MIN_BACKDROP_LUMA:
        return np.zeros((height, width), dtype=bool)
    close = np.abs(image - median).max(axis=2) <= COLOUR_TOLERANCE
    # Smooth where no neighbour differs by more than a gradient step.
    step = np.zeros((height, width), dtype=np.float32)
    dy = np.abs(np.diff(image, axis=0)).max(axis=2)
    dx = np.abs(np.diff(image, axis=1)).max(axis=2)
    step[:-1] = np.maximum(step[:-1], dy)
    step[1:] = np.maximum(step[1:], dy)
    step[:, :-1] = np.maximum(step[:, :-1], dx)
    step[:, 1:] = np.maximum(step[:, 1:], dx)
    candidate = close & (step <= STEP_TOLERANCE)
    labels = label(candidate, connectivity=1)  # type: ignore[no-untyped-call]
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge_labels = edge_labels[edge_labels > 0]
    mask = np.isin(labels, edge_labels)
    if mask.mean() < MIN_SHARE:
        return np.zeros((height, width), dtype=bool)
    # Close the one-pixel seams the step test leaves along soft edges of the backdrop itself.
    footprint = footprint_rectangle((5, 5))  # type: ignore[no-untyped-call]
    closed = closing(mask, footprint).astype(bool)
    return np.asarray(closed & close)


def clear_backdrop(data: bytes) -> bytes:
    """The artwork with a painted backdrop turned to white, or the same bytes when it has none."""
    with Image.open(io.BytesIO(data)) as source:
        artwork = source.convert("RGB")
    small = artwork.copy()
    small.thumbnail((WORK_SIZE, WORK_SIZE))
    mask = backdrop_mask(np.asarray(small))
    if not mask.any():
        return data
    full = Image.fromarray(mask.astype(np.uint8) * 255).resize(
        artwork.size, Image.Resampling.NEAREST
    )
    pixels = np.asarray(artwork).copy()
    pixels[np.asarray(full) > 0] = 255
    out = io.BytesIO()
    Image.fromarray(pixels).save(out, format="PNG")
    return out.getvalue()


__all__ = ["backdrop_mask", "clear_backdrop"]
