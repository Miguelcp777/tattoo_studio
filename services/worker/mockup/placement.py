"""Coverage resolution (ADR-0008).

A request naming a whole body zone is a statement about the body, so it is resolved in
millimetres from reference anatomy and the projection follows from those millimetres. The
nudge controls remain visual-only and never touch the brief.
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from PIL import Image

from mockup.anatomy import ZONE_SPAN_MM

# Generated backgrounds are prompted for skin filling the central ~80% of the frame
# (generation/studio.py). This is that framing, not a measurement of the photograph.
SKIN_FRAME_FRACTION = 0.82
# Hard limit so the design cannot run off the image; unrelated to where the body is.
FRAME_LIMIT = 0.94
# Fallback vertical span for a zone with no reference entry.
DEFAULT_SPAN_MM = 400.0

_VERB = r"(?:ocup\w*|cubr\w*|rellen\w*|abarc\w*|coj\w*|cog\w*|llen\w*|tap\w*|pill\w*|extend\w*)"
_ALL = r"(?:tod[oa]s?|enter[oa]s?|enterit[oa]s?|complet[oa]s?|al completo)"
_SPAN = r"de (?:arriba (?:a )?abajo|abajo (?:a )?arriba)"
_ZONE = (
    r"(?:gemelos?|pantorrillas?|espinillas?|antebrazos?|brazos?|muslos?|piernas?|espaldas?|"
    r"pechos?|costillas?|hombros?|cuellos?|manos?|pies?|pie|tobillos?|munecas?|caderas?|"
    r"barrigas?|estomagos?|tripas?|columnas?|esternones?|esternon|claviculas?|zonas?|"
    r"superficies?|areas?)"
)
_JOINT = r"(?:rodillas?|tobillos?|munecas?|codos?|hombros?|caderas?|ingles?|ingle)"
_JOINT_TO_JOINT = rf"\bde (?:l[ao] )?{_JOINT}\s+(?:a|al|hasta)\s+(?:l[ao] )?{_JOINT}\b"
_NEGATED = r"\bno\s+(?:l[oa] )?(?:quiero|me\s+gusta|hace\s+falta|es\s+necesario|deseo)"
_ARTWORK_CHANGE = (
    r"\b(?:anad\w*|agreg\w*|quit\w*|elimin\w*|sustitu\w*|reemplaz\w*|cambi\w*|"
    r"escudo|virgen|senyera|color\w*|flor\w*|leon|lobo|rosa\w*|calaver\w*)\b"
)
_NUDGE = (
    r"(?:haz(?:l[oa])? |(?:l[oa] )?quiero (?:el tatuaje )?)?(?:el tatuaje )?"
    r"(?:un poco |mucho )?mas (grande|pequeno)"
)


@dataclass(frozen=True)
class Coverage:
    """A resolved coverage request. `full` is a zone request and resizes the brief."""

    kind: str  # "full" | "larger" | "smaller"
    placement_only: bool

    @property
    def resizes_zone(self) -> bool:
        """Whole-zone requests resolve in millimetres; nudges are visual only (ADR-0008)."""
        return self.kind == "full"


def _fold(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"
    ).strip(" .!¡?¿")


def whole_zone_intent(text: str) -> bool:
    """True when the sentence asks for a body zone to be covered end to end.

    The Spanish noun is deliberately not mapped onto the `bodyPart` enum: the brief already
    declares the body part, and guessing whether "pierna" means calf or thigh would invent an
    answer the brief holds (ADR-0008).
    """
    folded = _fold(text)
    if re.search(_NEGATED, folded):
        return False
    zone = re.search(rf"\b{_ZONE}\b", folded)
    quantified = re.search(rf"\b{_ALL}\b", folded) or re.search(_SPAN, folded)
    if zone and quantified:
        return True
    if re.search(rf"\b{_VERB}\b", folded) and re.search(_SPAN, folded):
        return True
    return bool(re.search(_JOINT_TO_JOINT, folded))


def coverage_request(edit: dict[str, Any]) -> Coverage | None:
    explicit = edit.get("coverage")
    if explicit:
        # The fill-zone control is an explicit whole-zone request, like the phrase.
        return Coverage(str(explicit), edit.get("mode") == "placement")
    folded = _fold(edit["instruction"])
    if whole_zone_intent(folded):
        # A mixed request keeps the artwork edit but still applies whole-zone coverage.
        return Coverage("full", not re.search(_ARTWORK_CHANGE, folded))
    nudge = re.fullmatch(_NUDGE, folded)
    if nudge:
        return Coverage("larger" if nudge[1] == "grande" else "smaller", True)
    return None


def _span_height_mm(body_part: str | None) -> float:
    if body_part in ZONE_SPAN_MM:
        return ZONE_SPAN_MM[body_part][1]
    return DEFAULT_SPAN_MM


def fit_coverage(
    background: bytes,
    size: dict[str, float],
    coverage: str,
    previous: dict[str, Any] | None = None,
    *,
    body_part: str | None = None,
) -> dict[str, float]:
    """Project a physical size onto the frame.

    For `auto` and `full` the projection is a function of the millimetres alone: a zone request
    differs from `auto` because the caller has already resized the brief, not because a ceiling
    was raised. Nudges scale the previous projection and leave millimetres untouched.
    """
    if previous and previous.get("photoWidthMm"):
        raise ValueError(
            "La foto está calibrada: cambia las medidas físicas para ampliar el tatuaje."
        )
    with Image.open(io.BytesIO(background)) as photo:
        aspect = photo.height / photo.width
    ratio = size["heightMm"] / size["widthMm"]
    maximum = min(FRAME_LIMIT, FRAME_LIMIT * aspect / ratio)
    if coverage in ("auto", "full"):
        # Illustrative: the fraction of the frame the zone is assumed to occupy, scaled by how
        # much of that zone the design actually claims. Not measured body segmentation.
        occupancy = min(1.0, size["heightMm"] / _span_height_mm(body_part))
        width = min(maximum, max(0.12, SKIN_FRAME_FRACTION * occupancy * aspect / ratio))
    else:
        old = (previous or {}).get("width", 0.36)
        width = min(maximum, old * (1.35 if coverage == "larger" else 0.75))
    height = width * ratio / aspect
    return {"x": (1 - width) / 2, "y": (1 - height) / 2, "width": width}
