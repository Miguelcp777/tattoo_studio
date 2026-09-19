"""Python half of the shared fixture corpus.

The TypeScript suite reads the same manifest and the same fixture files. Both must
reach the identical verdict on every case; that agreement is what ARCH-INV-005 asks
for, and is why the corpus lives outside either runtime.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema.validators import Draft202012Validator

from tattoo_contracts import (
    TattooBriefValidationError,
    assert_tattoo_brief,
    is_valid_tattoo_brief,
    tattoo_brief_schema,
    validate_tattoo_brief,
)

CONTRACTS_ROOT = Path(__file__).resolve().parents[2]
CORPUS = CONTRACTS_ROOT / "fixtures" / "tattoo-brief"
CANONICAL_SCHEMA = CONTRACTS_ROOT / "schemas" / "tattoo-brief.schema.json"
PACKAGED_SCHEMA = (
    Path(__file__).resolve().parents[1]
    / "tattoo_contracts"
    / "schemas"
    / "tattoo-brief.schema.json"
)


def _manifest() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    return data


def _cases(valid: bool) -> list[dict[str, Any]]:
    return [c for c in _manifest()["cases"] if c["valid"] is valid]


def _load(relative: str) -> Any:
    return json.loads((CORPUS / relative).read_text(encoding="utf-8"))


VALID_CASES = _cases(valid=True)
INVALID_CASES = _cases(valid=False)


def test_corpus_is_substantial_enough_to_be_meaningful() -> None:
    """Guards against the corpus being emptied, which would make everything else pass."""
    assert len(VALID_CASES) >= 5
    assert len(INVALID_CASES) >= 12


@pytest.mark.parametrize("case", VALID_CASES, ids=lambda c: str(c["name"]))
def test_accepts_valid_fixture(case: dict[str, Any]) -> None:
    issues = validate_tattoo_brief(_load(case["file"]))

    assert issues == [], f"expected valid ({case['why']}) but got {issues}"


@pytest.mark.parametrize("case", INVALID_CASES, ids=lambda c: str(c["name"]))
def test_rejects_invalid_fixture(case: dict[str, Any]) -> None:
    assert not is_valid_tattoo_brief(_load(case["file"])), (
        f"expected rejection because {case['why']}"
    )


def test_schema_is_valid_against_the_2020_12_metaschema() -> None:
    """A malformed schema would make every other assertion here meaningless."""
    Draft202012Validator.check_schema(tattoo_brief_schema())


def test_packaged_schema_is_byte_identical_to_canonical() -> None:
    """The two runtimes must read the same bytes, not merely similar documents.

    The packaged copy exists so the installed package can find its schema without
    reaching outside its own tree. This asserts the copy is not stale.
    """
    assert PACKAGED_SCHEMA.read_bytes() == CANONICAL_SCHEMA.read_bytes()


def test_reports_every_problem_at_once() -> None:
    payload = dict(_load("invalid/size-below-minimum.json"))
    payload["revision"] = 0

    issues = validate_tattoo_brief(payload)

    assert len(issues) > 1


def test_error_names_the_failing_path() -> None:
    with pytest.raises(TattooBriefValidationError) as raised:
        assert_tattoo_brief(_load("invalid/size-below-minimum.json"))

    assert any("widthMm" in issue.path for issue in raised.value.issues)


def test_rejects_pixel_dimensions() -> None:
    """CONTRACTS-INV-001: millimetres are authoritative; pixels are not in the contract."""
    assert not is_valid_tattoo_brief(_load("invalid/pixel-dimensions-instead-of-mm.json"))


def test_rejects_style_outside_closed_vocabulary() -> None:
    """CONTRACTS-INV-002: free text is not accepted in the style field."""
    assert not is_valid_tattoo_brief(_load("invalid/style-free-text.json"))


def test_pattern_rejects_non_ascii_digits() -> None:
    """The reason every pattern spells out [0-9].

    Python's ``re`` matches Unicode digits with ``\\d`` while JavaScript's does not, so
    a ``\\d``-based timestamp pattern would accept this payload here and reject it in
    TypeScript — silent drift of exactly the kind ADR-0004 exists to prevent.
    """
    assert not is_valid_tattoo_brief(_load("invalid/timestamp-non-ascii-digits.json"))
