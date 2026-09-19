"""Python half of the shared fixture corpus.

The TypeScript suite reads the same manifests and the same fixture files. Both must
reach the identical verdict on every case; that agreement is what ARCH-INV-005 asks
for, and is why the corpus lives outside either runtime.

The suite is driven by ``SCHEMA_NAMES``, so a new schema is covered the moment it is
registered — there is no per-schema test to forget to write.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema.validators import Draft202012Validator

from tattoo_contracts import (
    DESIGN,
    SCHEMA_NAMES,
    TATTOO_BRIEF,
    ContractValidationError,
    assert_design,
    assert_tattoo_brief,
    is_valid,
    schema,
    validate,
)

CONTRACTS_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = CONTRACTS_ROOT / "fixtures"
CANONICAL_SCHEMAS = CONTRACTS_ROOT / "schemas"
PACKAGED_SCHEMAS = Path(__file__).resolve().parents[1] / "tattoo_contracts" / "schemas"


def _manifest(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(
        (FIXTURES / name / "manifest.json").read_text(encoding="utf-8")
    )
    return data


def _cases(name: str, *, valid: bool) -> list[dict[str, Any]]:
    return [c for c in _manifest(name)["cases"] if c["valid"] is valid]


def _load(name: str, relative: str) -> Any:
    return json.loads((FIXTURES / name / relative).read_text(encoding="utf-8"))


def _all_cases(*, valid: bool) -> list[tuple[str, dict[str, Any]]]:
    return [(n, c) for n in SCHEMA_NAMES for c in _cases(n, valid=valid)]


def _case_id(item: tuple[str, dict[str, Any]]) -> str:
    return f"{item[0]}:{item[1]['name']}"


@pytest.mark.parametrize("name", SCHEMA_NAMES)
def test_corpus_is_substantial_enough_to_be_meaningful(name: str) -> None:
    """Guards against a corpus being emptied, which would make everything else pass."""
    assert len(_cases(name, valid=True)) >= 5
    assert len(_cases(name, valid=False)) >= 12


@pytest.mark.parametrize("item", _all_cases(valid=True), ids=_case_id)
def test_accepts_valid_fixture(item: tuple[str, dict[str, Any]]) -> None:
    name, case = item

    issues = validate(name, _load(name, case["file"]))

    assert issues == [], f"expected valid ({case['why']}) but got {issues}"


@pytest.mark.parametrize("item", _all_cases(valid=False), ids=_case_id)
def test_rejects_invalid_fixture(item: tuple[str, dict[str, Any]]) -> None:
    name, case = item

    assert not is_valid(name, _load(name, case["file"])), (
        f"expected rejection because {case['why']}"
    )


@pytest.mark.parametrize("name", SCHEMA_NAMES)
def test_schema_is_valid_against_the_2020_12_metaschema(name: str) -> None:
    """A malformed schema would make every other assertion here meaningless."""
    Draft202012Validator.check_schema(schema(name))


@pytest.mark.parametrize("name", SCHEMA_NAMES)
def test_packaged_schema_is_byte_identical_to_canonical(name: str) -> None:
    """The two runtimes must read the same bytes, not merely similar documents."""
    filename = f"{name}.schema.json"

    assert (PACKAGED_SCHEMAS / filename).read_bytes() == (CANONICAL_SCHEMAS / filename).read_bytes()


def test_every_canonical_schema_is_registered() -> None:
    """A schema file nobody registered would be silently untested."""
    on_disk = {p.name.removesuffix(".schema.json") for p in CANONICAL_SCHEMAS.glob("*.schema.json")}

    assert on_disk == set(SCHEMA_NAMES)


def test_every_registered_schema_has_a_corpus() -> None:
    """A registered schema with no fixtures would pass vacuously."""
    for name in SCHEMA_NAMES:
        assert (FIXTURES / name / "manifest.json").is_file(), f"no corpus for {name}"


def test_unknown_schema_name_is_rejected() -> None:
    with pytest.raises(KeyError):
        schema("not-a-schema")


def test_reports_every_problem_at_once() -> None:
    payload = dict(_load(TATTOO_BRIEF, "invalid/size-below-minimum.json"))
    payload["revision"] = 0

    issues = validate(TATTOO_BRIEF, payload)

    assert len(issues) > 1


def test_brief_error_names_the_failing_path() -> None:
    with pytest.raises(ContractValidationError) as raised:
        assert_tattoo_brief(_load(TATTOO_BRIEF, "invalid/size-below-minimum.json"))

    assert any("widthMm" in issue.path for issue in raised.value.issues)


def test_design_error_names_the_schema() -> None:
    with pytest.raises(ContractValidationError) as raised:
        assert_design(_load(DESIGN, "invalid/missing-provenance.json"))

    assert raised.value.schema_name == "Design"


def test_rejects_pixel_dimensions_on_a_brief() -> None:
    """CONTRACTS-INV-001: millimetres are authoritative; pixels are not in the brief."""
    assert not is_valid(
        TATTOO_BRIEF, _load(TATTOO_BRIEF, "invalid/pixel-dimensions-instead-of-mm.json")
    )


def test_rejects_physical_size_on_a_design() -> None:
    """The mirror of the rule above.

    A design's raster has pixels and no millimetres; the tattoo's physical size lives
    on the brief. Putting mm on a design would create a second source of truth for
    size, which is exactly what CONTRACTS-INV-001 forbids.
    """
    assert not is_valid(DESIGN, _load(DESIGN, "invalid/unknown-top-level-field.json"))


def test_rejects_style_outside_closed_vocabulary() -> None:
    """CONTRACTS-INV-002: free text is not accepted in the style field."""
    assert not is_valid(TATTOO_BRIEF, _load(TATTOO_BRIEF, "invalid/style-free-text.json"))


def test_rejects_signed_url_as_storage_key() -> None:
    """SEC-INV-008: storage keys are opaque handles, never signed or public URLs."""
    assert not is_valid(DESIGN, _load(DESIGN, "invalid/storage-key-is-a-url.json"))


@pytest.mark.parametrize(
    ("name", "fixture"),
    [
        (TATTOO_BRIEF, "invalid/timestamp-non-ascii-digits.json"),
        (DESIGN, "invalid/timestamp-non-ascii-digits.json"),
    ],
)
def test_pattern_rejects_non_ascii_digits(name: str, fixture: str) -> None:
    """The reason every pattern spells out [0-9].

    Python's ``re`` matches Unicode digits with ``\\d`` while JavaScript's does not, so
    a ``\\d``-based timestamp pattern would accept these payloads here and reject them
    in TypeScript — silent drift of exactly the kind ADR-0004 exists to prevent.
    """
    assert not is_valid(name, _load(name, fixture))
