"""Turn a validated ``TattooBrief`` into a generation prompt.

Pure and offline, which is what makes the invariants here cheap to test adversarially.

Two invariants live in this module and nowhere else:

* **FLASH-INV-001** — the output must be flat artwork. Every prompt carries explicit
  instructions against bodies, skin, scenes and backgrounds, and a negative prompt
  reinforcing the same.
* **FLASH-INV-004 / PROD-INV-004** — no prompt may request the style of a named living
  artist.

On that second one, read the limitation carefully. This module strips the *grammatical
constructions* that request mimicry ("in the style of ...", "inspired by ...") from
free-text fields. It does **not** recognise artist names, because a name blocklist
belongs to the safety module (SAFETY-INV-006), which does not exist yet.

So a brief whose subject description simply says "Horiyoshi dragon" passes through
untouched. That is a real gap, not an oversight, and it closes when TASK-0007 lands and
supplies a screener through :class:`PromptScreen`. Until then this is partial mitigation
and must be described as such.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from math import gcd
from typing import Any, Protocol

#: Longest side of a generated raster. Physical size lives on the brief in millimetres
#: and is never derived from this (CONTRACTS-INV-001).
TARGET_LONG_EDGE_PX = 1024

#: Diffusion models behave best on multiples of 64.
DIMENSION_QUANTUM = 64

#: Smallest short edge a diffusion model renders usefully. With the long edge above,
#: this caps the renderable aspect ratio at 1:8.
MIN_DIMENSION_PX = 128

MAX_ASPECT_RATIO = TARGET_LONG_EDGE_PX / MIN_DIMENSION_PX


class UnrenderableAspectError(ValueError):
    """The brief's proportions cannot be rendered at a usable raster size.

    Raised rather than clamped. Clamping would produce artwork of the wrong shape while
    reporting success, which silently breaks FLASH-INV-003 and makes the brief's
    millimetre size meaningless — the exact failure the invariant exists to prevent.

    Note that the contract permits size combinations that land here: 5mm and 600mm are
    both individually legal, so a 5x600 brief validates and then cannot be rendered.
    See FINDING-0002.
    """


STYLE_PHRASES: dict[str, str] = {
    "american_traditional": (
        "American traditional tattoo flash, bold even outlines, limited flat palette"
    ),
    "fine_line": "fine-line tattoo design, delicate single-weight linework, minimal shading",
    "black_and_grey_realism": (
        "black and grey realism tattoo, smooth gradients, photographic depth"
    ),
    "neo_traditional": (
        "neo-traditional tattoo, illustrative forms, varied line weight, rich colour"
    ),
    "irezumi": "Japanese irezumi tattoo composition, traditional motifs, bold outlines",
    "blackwork": "blackwork tattoo, solid black fills, strong negative space",
    "illustrative": "illustrative tattoo design, drawn quality, clear silhouette",
    "ornamental": "ornamental tattoo, symmetrical geometric patterning, decorative detail",
    "lettering": "tattoo lettering, clean legible letterforms, consistent stroke weight",
    "tribal": (
        "bold solid black curvilinear bands, tapering points and interlocking negative space, "
        "flowing with the limb"
    ),
    "geometric": (
        "precise hard-edged geometry, repeated polygons and concentric construction lines, "
        "exact symmetry"
    ),
    "watercolour": (
        "loose translucent colour washes with soft bleeding edges and visible pigment pooling, "
        "over restrained linework"
    ),
    "new_school": (
        "exaggerated cartoon proportions, heavy dark outlines and saturated high-contrast colour, "
        "strong depth"
    ),
    "chicano": (
        "fine black and grey single-needle shading, smooth soft gradients, script and "
        "photographic portraiture"
    ),
    "biomechanical": (
        "interlocking mechanical forms beneath torn organic surfaces, metallic highlights and "
        "deep recessed shadow"
    ),
    "surrealism": "surrealist tattoo design, dreamlike composition, unexpected juxtaposition",
}

LINEWORK_PHRASES: dict[str, str] = {
    "fine": "fine delicate linework",
    "medium": "medium weight linework",
    "bold": "bold heavy outlines",
    "mixed": "varied line weight",
}

SHADING_PHRASES: dict[str, str] = {
    "none": "no shading, line art only",
    "whip": "whip shading",
    "dotwork": "dotwork stippled shading",
    "smooth_blend": "smooth blended shading",
    "solid_fill": "solid fills",
    "mixed": "mixed shading techniques",
}

INTENSITY_PHRASES: dict[str, str] = {
    "light": "light shading",
    "medium": "moderate shading",
    "heavy": "heavy dense shading",
}

COLOUR_PHRASES: dict[str, str] = {
    "black_and_grey": "black and grey only, no colour",
    "colour": "full colour",
    "black_and_grey_with_accent": "black and grey with selective accent colour",
}

#: Instructions that keep the render flat artwork rather than a scene (FLASH-INV-001).
FLATNESS_CLAUSE = (
    "flat 2D tattoo flash artwork on a plain white background, "
    "isolated design only, no body, no skin, no person, no scene, no background imagery"
)

NEGATIVE_PROMPT = (
    "photograph, body, skin, arm, leg, torso, person, model, mannequin, scene, landscape, "
    "background, mockup, tattooed body, watermark, signature, text caption, frame, border"
)

#: Constructions that request imitation of a named artist. The name itself is not
#: matched — see the module docstring for why.
_MIMICRY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bin\s+the\s+style\s+of\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bstyle\s+of\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bstyled\s+(?:like|after)\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\binspired\s+by\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bhomage\s+to\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bcopy\s+of\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bimitat(?:e|ing|ion\s+of)\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\bà\s+la\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\ba\s+la\b[^.,;]*", re.IGNORECASE),
    re.compile(r"\blike\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+"),
    re.compile(r"\bby\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+"),
)


class PromptScreen(Protocol):
    """The slice of `safety` that prompt construction needs.

    Implemented by the safety module in TASK-0007, which owns the living-artist
    blocklist (SAFETY-INV-006). Until then nothing satisfies this and the heuristic
    below is all there is.
    """

    def screen_text(self, text: str) -> str:
        """Return the text with prohibited content removed, or raise to reject it."""
        ...


def strip_mimicry_requests(text: str) -> str:
    """Remove phrases that ask for another artist's style.

    Removes the request, not the subject: "a snake in the style of Horiyoshi" becomes
    "a snake". Deliberately conservative about bare names, since stripping every
    capitalised pair would mangle ordinary briefs.
    """
    cleaned = text
    for pattern in _MIMICRY_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)
    # Collapse the whitespace and stray punctuation left behind by the removals.
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([.,;])", r"\1", cleaned)
    cleaned = re.sub(r"[,;]\s*(?=[,;.])", "", cleaned)
    return cleaned.strip(" ,;")


@dataclass(frozen=True, slots=True)
class PromptPlan:
    """Everything the generation call needs, derived from a brief."""

    prompt: str
    negative_prompt: str
    width_px: int
    height_px: int

    @property
    def aspect_ratio(self) -> float:
        return self.width_px / self.height_px


def _quantise(value: float) -> int:
    stepped = round(value / DIMENSION_QUANTUM) * DIMENSION_QUANTUM
    return max(DIMENSION_QUANTUM, stepped)


def raster_size_for(width_mm: float, height_mm: float) -> tuple[int, int]:
    """Pick raster dimensions preserving the brief's physical aspect ratio.

    The millimetre size stays authoritative (CONTRACTS-INV-001); these pixels only
    describe the artifact. Preserving the ratio is what keeps the physical size
    meaningful once the design is placed or printed (FLASH-INV-003).
    """
    if width_mm <= 0 or height_mm <= 0:
        raise ValueError("millimetre dimensions must be positive")

    ratio = max(width_mm / height_mm, height_mm / width_mm)
    if ratio > MAX_ASPECT_RATIO:
        raise UnrenderableAspectError(
            f"aspect ratio {ratio:.1f}:1 exceeds the renderable maximum "
            f"{MAX_ASPECT_RATIO:.0f}:1; refusing rather than rendering the wrong shape"
        )

    width: float
    height: float
    if width_mm >= height_mm:
        width = float(TARGET_LONG_EDGE_PX)
        height = TARGET_LONG_EDGE_PX * height_mm / width_mm
    else:
        height = float(TARGET_LONG_EDGE_PX)
        width = TARGET_LONG_EDGE_PX * width_mm / height_mm

    return _quantise(width), _quantise(height)


def _aspect_label(width_mm: float, height_mm: float) -> str:
    """A human-readable ratio for the prompt, e.g. '2:3'."""
    w, h = round(width_mm * 100), round(height_mm * 100)
    divisor = gcd(w, h) or 1
    w, h = w // divisor, h // divisor
    while max(w, h) > 32:
        w, h = max(1, round(w / 2)), max(1, round(h / 2))
    return f"{w}:{h}"


def build_prompt(brief: dict[str, Any], *, screen: PromptScreen | None = None) -> PromptPlan:
    """Build the generation plan for a brief.

    ``screen``, once the safety module provides one, is applied to every free-text
    field before it reaches the prompt.
    """
    size = brief["size"]
    width_px, height_px = raster_size_for(size["widthMm"], size["heightMm"])

    def clean(text: str) -> str:
        stripped = strip_mimicry_requests(text)
        return screen.screen_text(stripped) if screen is not None else stripped

    subject = brief["subject"]
    parts: list[str] = [clean(subject["description"])]

    elements = subject.get("elements") or []
    if elements:
        parts.append("featuring " + ", ".join(clean(str(e)) for e in elements))

    style = brief["style"]
    parts.append(STYLE_PHRASES[style["primary"]])
    if style.get("secondary"):
        parts.append("with elements of " + STYLE_PHRASES[style["secondary"]])
    if style.get("notes"):
        parts.append(clean(str(style["notes"])))

    parts.append(LINEWORK_PHRASES[brief["linework"]["weight"]])

    shading = brief["shading"]
    parts.append(SHADING_PHRASES[shading["technique"]])
    if shading["technique"] != "none":
        parts.append(INTENSITY_PHRASES[shading["intensity"]])

    colour = brief["colour"]
    parts.append(COLOUR_PHRASES[colour["mode"]])
    palette = colour.get("palette") or []
    if palette:
        parts.append("palette: " + ", ".join(str(c) for c in palette))

    constraints = brief.get("constraints") or {}
    if constraints.get("coverUp"):
        # A cover-up must be dense and dark enough to hide existing work.
        parts.append("dense dark composition suitable for covering existing work")
    avoid = constraints.get("avoid") or []

    parts.append(f"composition in {_aspect_label(size['widthMm'], size['heightMm'])} aspect ratio")
    parts.append(FLATNESS_CLAUSE)

    negative = NEGATIVE_PROMPT
    if avoid:
        negative = negative + ", " + ", ".join(str(a) for a in avoid)

    prompt = ", ".join(p for p in parts if p)
    return PromptPlan(
        prompt=prompt,
        negative_prompt=negative,
        width_px=width_px,
        height_px=height_px,
    )
