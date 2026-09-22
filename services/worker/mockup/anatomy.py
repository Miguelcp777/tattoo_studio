"""Reference adult anatomy (ADR-0008). Declared convention, never the user's measurements.

Each entry is the usable ink span of a body zone in millimetres: the area a tattooer would
realistically work within, not the anatomical extent of the limb. Values are deliberately
conservative — a span that is slightly small yields a tattoo that fits, a span that is slightly
large yields one that runs off the zone.

These numbers are illustrative. They are identical for every user regardless of build, which is
wrong in the individual case and honest only because it is labelled as reference anatomy. A
calibrated photograph supersedes them (TASK-0024/REQ-010).
"""

from __future__ import annotations

# Contract bounds from tattoo-brief.schema.json `$defs/millimetres`.
MIN_MM = 5.0
MAX_MM = 600.0

# (widthMm, heightMm) of the usable ink span, keyed by the `bodyPart` enum.
ZONE_SPAN_MM: dict[str, tuple[float, float]] = {
    "inner_forearm": (110.0, 260.0),
    "outer_forearm": (120.0, 270.0),
    "upper_arm_inner": (110.0, 220.0),
    "upper_arm_outer": (130.0, 230.0),
    "shoulder": (180.0, 170.0),
    "collarbone": (180.0, 60.0),
    "chest": (300.0, 220.0),
    "sternum": (90.0, 220.0),
    "ribs": (200.0, 300.0),
    "stomach": (250.0, 220.0),
    "upper_back": (340.0, 300.0),
    "lower_back": (300.0, 180.0),
    "spine": (90.0, 450.0),
    "hip": (160.0, 200.0),
    "thigh_front": (190.0, 400.0),
    "thigh_outer": (180.0, 420.0),
    "calf": (140.0, 380.0),
    "shin": (110.0, 360.0),
    "ankle": (90.0, 110.0),
    "foot": (100.0, 200.0),
    "wrist_inner": (60.0, 70.0),
    "wrist_outer": (60.0, 70.0),
    "hand": (90.0, 140.0),
    "finger": (18.0, 60.0),
    "neck": (110.0, 130.0),
    "behind_ear": (35.0, 50.0),
}


def zone_size(body_part: str, ink_aspect: float) -> dict[str, float]:
    """Largest size of the given aspect that fits the zone, preserving the artwork's proportions.

    `ink_aspect` is height divided by width of the *visible* artwork, so the returned size
    describes the ink rather than the master's white padding.
    """
    try:
        span_width, span_height = ZONE_SPAN_MM[body_part]
    except KeyError as error:
        raise ValueError(f"No hay anatomía de referencia para «{body_part}».") from error
    if not ink_aspect > 0:
        raise ValueError("La proporción del dibujo debe ser positiva.")
    width = min(span_width, span_height / ink_aspect)
    height = width * ink_aspect
    if width < MIN_MM or height < MIN_MM:
        # Preserving aspect would produce an unprintable dimension; the zone is the wrong shape.
        raise ValueError("El dibujo no cabe en esta zona conservando sus proporciones.")
    return {"widthMm": min(width, MAX_MM), "heightMm": min(height, MAX_MM)}
