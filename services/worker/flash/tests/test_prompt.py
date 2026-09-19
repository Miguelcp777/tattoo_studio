"""Prompt construction, including the adversarial cases FLASH-INV-004 exists for.

All offline and deterministic. These prove a prompt is well-formed and free of mimicry
requests. They say nothing about whether it produces good artwork — that needs a
credential and a human looking at the result.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from flash import (
    UnrenderableAspectError,
    build_prompt,
    raster_size_for,
    strip_mimicry_requests,
)
from flash.prompt import (
    FLATNESS_CLAUSE,
    MIN_DIMENSION_PX,
    NEGATIVE_PROMPT,
    TARGET_LONG_EDGE_PX,
)

from .conftest import load_brief

# ---------------------------------------------------------------------------
# FLASH-INV-001: flat artwork only
# ---------------------------------------------------------------------------


def test_prompt_demands_flat_artwork(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    assert FLATNESS_CLAUSE in plan.prompt


@pytest.mark.parametrize("forbidden", ["body", "skin", "person", "scene", "background"])
def test_negative_prompt_excludes_embodied_output(forbidden: str, brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    assert forbidden in plan.negative_prompt


def test_avoid_constraints_are_appended_to_the_negative_prompt(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    # The corpus brief lists "skulls" under constraints.avoid
    assert "skulls" in plan.negative_prompt
    assert NEGATIVE_PROMPT in plan.negative_prompt


# ---------------------------------------------------------------------------
# FLASH-INV-004 / PROD-INV-004: no living-artist mimicry
# ---------------------------------------------------------------------------


ADVERSARIAL = [
    "a dragon in the style of Horiyoshi III",
    "a snake inspired by Sailor Jerry",
    "a rose styled like Kari Barba",
    "a tiger, homage to Filip Leu",
    "a wolf à la Nikko Hurtado",
    "a skull, copy of Bob Tyrrell",
    "a moth imitating Kat Von D",
    "a phoenix by Horiyoshi Nakamura",
    "a panther like Megan Massacre",
    "a koi in the style of a famous Japanese master",
]


@pytest.mark.parametrize("text", ADVERSARIAL)
def test_mimicry_constructions_are_stripped(text: str) -> None:
    cleaned = strip_mimicry_requests(text)

    for marker in ("style of", "inspired by", "styled like", "homage to", "copy of", "à la"):
        assert marker not in cleaned.lower()


@pytest.mark.parametrize("text", ADVERSARIAL)
def test_subject_survives_stripping(text: str) -> None:
    """Removing the request must not remove the tattoo.

    A stripper that returned an empty string would pass the test above and make the
    product useless.
    """
    cleaned = strip_mimicry_requests(text)

    assert len(cleaned.strip()) >= 5


@pytest.mark.parametrize("text", ADVERSARIAL)
def test_adversarial_subject_never_reaches_the_prompt(text: str) -> None:
    brief = load_brief()
    brief["subject"]["description"] = text

    plan = build_prompt(brief)

    for marker in ("style of", "inspired by", "styled like", "homage to"):
        assert marker not in plan.prompt.lower()


def test_adversarial_style_notes_never_reach_the_prompt() -> None:
    """`style.notes` is free text and is the most obvious smuggling route."""
    brief = load_brief()
    brief["style"]["notes"] = "make it exactly in the style of Horiyoshi III please"

    plan = build_prompt(brief)

    assert "style of" not in plan.prompt.lower()
    assert "horiyoshi" not in plan.prompt.lower()


def test_adversarial_elements_never_reach_the_prompt() -> None:
    brief = load_brief()
    brief["subject"]["elements"] = ["snake", "dagger inspired by Sailor Jerry"]

    plan = build_prompt(brief)

    assert "inspired by" not in plan.prompt.lower()
    assert "sailor jerry" not in plan.prompt.lower()


def test_ordinary_phrasing_is_not_mangled() -> None:
    """Over-stripping would quietly ruin legitimate briefs."""
    text = "a rose by a window, lit like morning"

    cleaned = strip_mimicry_requests(text)

    assert "rose" in cleaned
    assert "window" in cleaned


def test_a_bare_artist_name_is_a_known_gap() -> None:
    """Documents the limitation honestly rather than pretending it is covered.

    Name-level blocking belongs to the safety module (SAFETY-INV-006), which does not
    exist. A brief naming an artist without a mimicry construction passes through, and
    this test exists so that gap is visible rather than assumed closed.
    """
    brief = load_brief()
    brief["subject"]["description"] = "Horiyoshi dragon across the back"

    plan = build_prompt(brief)

    assert "horiyoshi" in plan.prompt.lower(), (
        "if this now fails, name screening has been added and this test should become "
        "an assertion that the name is removed"
    )


def test_a_screener_is_applied_to_every_free_text_field() -> None:
    """When safety supplies a screener, nothing free-text bypasses it."""

    class Redactor:
        def __init__(self) -> None:
            self.seen: list[str] = []

        def screen_text(self, text: str) -> str:
            self.seen.append(text)
            return text.replace("Horiyoshi", "[redacted]")

    brief = load_brief()
    brief["subject"]["description"] = "Horiyoshi dragon across the back"
    brief["style"]["notes"] = "Horiyoshi shading"
    brief["subject"]["elements"] = ["Horiyoshi waves"]
    screener = Redactor()

    plan = build_prompt(brief, screen=screener)

    assert "Horiyoshi" not in plan.prompt
    assert len(screener.seen) >= 3


# ---------------------------------------------------------------------------
# FLASH-INV-003: aspect ratio follows the brief's millimetres
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("w_mm", "h_mm"),
    [(90, 180), (180, 90), (100, 100), (60, 20), (37, 53), (128, 1024), (600, 300)],
)
def test_raster_preserves_physical_aspect_within_quantisation(w_mm: float, h_mm: float) -> None:
    width, height = raster_size_for(w_mm, h_mm)

    # Dimensions are quantised to multiples of 64, so exact equality is impossible.
    # The tolerance below is the quantisation error, not slack.
    expected = w_mm / h_mm
    actual = width / height
    tolerance = max(0.08, expected * 0.08)
    assert abs(actual - expected) <= tolerance, f"{actual} vs {expected}"


@pytest.mark.parametrize(("w_mm", "h_mm"), [(90, 180), (180, 90), (100, 100)])
def test_raster_dimensions_are_usable(w_mm: float, h_mm: float) -> None:
    width, height = raster_size_for(w_mm, h_mm)

    assert width % 64 == 0 and height % 64 == 0
    assert width >= MIN_DIMENSION_PX and height >= MIN_DIMENSION_PX
    assert max(width, height) <= TARGET_LONG_EDGE_PX


@pytest.mark.parametrize(("w_mm", "h_mm"), [(5, 600), (600, 5), (5, 100)])
def test_unrenderable_ratio_is_refused_not_silently_clamped(w_mm: float, h_mm: float) -> None:
    """Clamping would report success while producing the wrong shape.

    These briefs are legal under the contract — 5mm and 600mm are both individually
    within bounds — but no diffusion model renders 1:120 usefully. Refusing keeps
    FLASH-INV-003 honest; clamping would have quietly broken it. See FINDING-0002.
    """
    with pytest.raises(UnrenderableAspectError):
        raster_size_for(w_mm, h_mm)


def test_the_boundary_ratio_is_renderable() -> None:
    """1:8 is the documented limit and must work, so the refusal above is a real edge."""
    width, height = raster_size_for(128, 1024)

    assert width == MIN_DIMENSION_PX
    assert height == TARGET_LONG_EDGE_PX


@pytest.mark.parametrize(("w_mm", "h_mm"), [(0, 10), (10, 0), (-1, 10)])
def test_non_positive_millimetres_are_rejected(w_mm: float, h_mm: float) -> None:
    with pytest.raises(ValueError):
        raster_size_for(w_mm, h_mm)


def test_prompt_states_the_aspect_ratio(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    assert "aspect ratio" in plan.prompt


def test_plan_dimensions_match_the_brief(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)
    expected = raster_size_for(brief["size"]["widthMm"], brief["size"]["heightMm"])

    assert (plan.width_px, plan.height_px) == expected


# ---------------------------------------------------------------------------
# Structured fields reach the prompt
# ---------------------------------------------------------------------------


def test_style_vocabulary_becomes_a_phrase_not_a_raw_token(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    assert "american_traditional" not in plan.prompt
    assert "American traditional" in plan.prompt


def test_every_style_in_the_vocabulary_has_a_phrase() -> None:
    """A style the contract accepts but the prompt cannot express would fail at runtime."""
    from tattoo_contracts import tattoo_brief_schema

    from flash.prompt import STYLE_PHRASES

    vocabulary = tattoo_brief_schema()["$defs"]["styleName"]["enum"]

    assert set(vocabulary) == set(STYLE_PHRASES)


def test_every_enum_the_prompt_reads_is_covered() -> None:
    """Same guarantee for the other closed vocabularies the prompt maps."""
    from tattoo_contracts import tattoo_brief_schema

    from flash.prompt import COLOUR_PHRASES, INTENSITY_PHRASES, LINEWORK_PHRASES, SHADING_PHRASES

    schema = tattoo_brief_schema()["properties"]
    assert set(schema["linework"]["properties"]["weight"]["enum"]) == set(LINEWORK_PHRASES)
    assert set(schema["shading"]["properties"]["technique"]["enum"]) == set(SHADING_PHRASES)
    assert set(schema["shading"]["properties"]["intensity"]["enum"]) == set(INTENSITY_PHRASES)
    assert set(schema["colour"]["properties"]["mode"]["enum"]) == set(COLOUR_PHRASES)


def test_palette_is_included_when_present(brief: dict[str, Any]) -> None:
    plan = build_prompt(brief)

    assert "palette:" in plan.prompt


def test_cover_up_changes_the_prompt() -> None:
    brief = load_brief()
    brief["constraints"]["coverUp"] = True

    plan = build_prompt(brief)

    assert "covering existing work" in plan.prompt


def test_minimal_brief_produces_a_usable_prompt() -> None:
    """The smallest legal brief must still generate something coherent."""
    minimal = load_brief("minimal-required-only")

    plan = build_prompt(minimal)

    assert len(plan.prompt) > 80
    assert FLATNESS_CLAUSE in plan.prompt


def test_build_prompt_does_not_mutate_the_brief(brief: dict[str, Any]) -> None:
    before = copy.deepcopy(brief)

    build_prompt(brief)

    assert brief == before
