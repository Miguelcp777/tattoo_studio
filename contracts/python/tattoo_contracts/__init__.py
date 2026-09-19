"""Shared cross-runtime contracts for Tattoo Creator.

Validation authority lives in :mod:`tattoo_contracts.validation`, which runs the
canonical JSON Schema document. Generated pydantic models are ergonomics only.
"""

from tattoo_contracts.validation import (
    TattooBriefValidationError,
    ValidationIssue,
    assert_tattoo_brief,
    is_valid_tattoo_brief,
    tattoo_brief_schema,
    validate_tattoo_brief,
)

__all__ = [
    "TattooBriefValidationError",
    "ValidationIssue",
    "assert_tattoo_brief",
    "is_valid_tattoo_brief",
    "tattoo_brief_schema",
    "validate_tattoo_brief",
]
