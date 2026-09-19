"""Validation authority for the Python runtime.

The canonical JSON Schema document is the validator input, exactly as it is in
TypeScript. Nothing here reimplements a rule, and nothing here should: the point of
the contracts module is that one document decides validity in both runtimes
(ARCH-INV-005).

The generated pydantic models in ``tattoo_contracts.generated`` are ergonomics for
FastAPI and editors. They cannot express the schema's conditional colour rules, so
they are never consulted for a verdict.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from typing import Any

from jsonschema import Draft202012Validator

SCHEMA_FILENAME = "tattoo-brief.schema.json"


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """A validation failure, reduced to what a caller can act on."""

    path: str
    """JSON Pointer into the payload, e.g. ``/size/widthMm``. Empty means the root."""

    message: str
    keyword: str


class TattooBriefValidationError(ValueError):
    """Raised by :func:`assert_tattoo_brief`, naming the schema and failing paths."""

    def __init__(self, issues: list[ValidationIssue]) -> None:
        detail = "; ".join(f"{i.path or '<root>'}: {i.message}" for i in issues)
        super().__init__(f"TattooBrief failed validation: {detail}")
        self.issues = issues


@lru_cache(maxsize=1)
def tattoo_brief_schema() -> dict[str, Any]:
    """Load the packaged schema copy.

    The copy is generated from ``contracts/schemas/`` and a test asserts byte
    identity, so this is the same document the TypeScript runtime compiles.
    """
    source = resources.files("tattoo_contracts.schemas").joinpath(SCHEMA_FILENAME)
    data: dict[str, Any] = json.loads(source.read_text(encoding="utf-8"))
    return data


@lru_cache(maxsize=1)
def _validator() -> Draft202012Validator:
    # format is deliberately unused in the schema, so no format checker is wired up.
    # Patterns carry the assertions instead, which both runtimes enforce identically.
    return Draft202012Validator(tattoo_brief_schema())


def _to_pointer(error_path: Any) -> str:
    return "".join(f"/{part}" for part in error_path)


def validate_tattoo_brief(payload: object) -> list[ValidationIssue]:
    """Validate a payload, returning every issue found.

    Returns an empty list when the payload is valid. Callers at a boundary generally
    need all problems at once rather than the first.
    """
    issues = [
        ValidationIssue(
            path=_to_pointer(error.absolute_path),
            message=error.message,
            keyword=str(error.validator),
        )
        for error in _validator().iter_errors(payload)
    ]
    return sorted(issues, key=lambda i: (i.path, i.keyword))


def is_valid_tattoo_brief(payload: object) -> bool:
    """Whether the payload satisfies the contract."""
    return not validate_tattoo_brief(payload)


def assert_tattoo_brief(payload: object) -> dict[str, Any]:
    """Validate, or raise a typed error naming the schema and the failing paths."""
    issues = validate_tattoo_brief(payload)
    if issues:
        raise TattooBriefValidationError(issues)
    assert isinstance(payload, dict)
    return payload
