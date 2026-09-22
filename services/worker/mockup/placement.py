"""Illustrative coverage controls; never a substitute for photograph calibration."""

from __future__ import annotations

import io
import re
import unicodedata
from typing import Any

from PIL import Image


def coverage_request(edit: dict[str, Any]) -> tuple[str | None, bool]:
    explicit = edit.get("coverage")
    text = "".join(
        c
        for c in unicodedata.normalize("NFD", edit["instruction"].lower())
        if unicodedata.category(c) != "Mn"
    ).strip(" .!")
    full = re.fullmatch(
        r"(?:(?:quiero|haz|hacer|necesito) (?:que )?)?(?:el tatuaje |el diseno )?"
        r"(?:ocupe|ocupar|cubra|cubrir|rellene|rellenar) (?:casi )?tod[oa] "
        r"(?:el |la |mi )?(?:gemelo|pantorrilla|zona|pierna)",
        text,
    )
    simple = re.fullmatch(
        r"(?:haz(?:lo)? |quiero (?:el tatuaje )?)?(?:el tatuaje )?"
        r"(?:un poco |mucho )?mas (grande|pequeno)",
        text,
    )
    if explicit:
        return str(explicit), edit.get("mode") == "placement"
    if full:
        return "full", True
    if simple:
        return ("larger" if simple[1] == "grande" else "smaller"), True
    # Mixed requests keep the artwork edit but still apply whole-calf coverage.
    if re.search(
        r"(?:ocup\w*|cubr\w*) (?:casi )?tod[oa] (?:el |la |mi )?(?:gemelo|pantorrilla)", text
    ):
        artwork_change = re.search(
            r"\b(?:anad\w*|quit\w*|elimin\w*|sustitu\w*|cambi\w*|escudo|virgen|senyera|color\w*|flor\w*|leon)\b",
            text,
        )
        return "full", not bool(artwork_change)
    return None, False


def fit_coverage(
    background: bytes, size: dict[str, float], coverage: str, previous: dict[str, Any] | None = None
) -> dict[str, float]:
    if previous and previous.get("photoWidthMm"):
        raise ValueError(
            "La foto está calibrada: cambia las medidas físicas para ampliar el tatuaje."
        )
    with Image.open(io.BytesIO(background)) as photo:
        aspect = photo.height / photo.width
    ratio = size["heightMm"] / size["widthMm"]
    maximum = min(0.82, 0.82 * aspect / ratio)
    old = (previous or {}).get("width", 0.36)
    if coverage == "auto":
        # A generated calf frame is illustrative, approximately 400 mm vertically.
        width = min(maximum, max(0.12, aspect * size["widthMm"] / 400))
    else:
        width = (
            maximum
            if coverage == "full"
            else min(maximum, old * (1.35 if coverage == "larger" else 0.75))
        )
    height = width * ratio / aspect
    return {"x": (1 - width) / 2, "y": (1 - height) / 2, "width": width}
