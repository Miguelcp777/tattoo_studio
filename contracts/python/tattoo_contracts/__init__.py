"""Shared cross-runtime contracts for Tattoo Creator.

Validation authority lives in :mod:`tattoo_contracts.validation`, which runs the
canonical JSON Schema documents. Generated pydantic models are ergonomics only.
"""

from tattoo_contracts.validation import (
    DESIGN,
    SCHEMA_NAMES,
    TATTOO_BRIEF,
    ContractValidationError,
    DesignValidationError,
    TattooBriefValidationError,
    ValidationIssue,
    assert_design,
    assert_tattoo_brief,
    design_schema,
    is_valid,
    is_valid_design,
    is_valid_tattoo_brief,
    schema,
    tattoo_brief_schema,
    validate,
    validate_design,
    validate_tattoo_brief,
)

__all__ = [
    "DESIGN",
    "SCHEMA_NAMES",
    "TATTOO_BRIEF",
    "ContractValidationError",
    "DesignValidationError",
    "TattooBriefValidationError",
    "ValidationIssue",
    "assert_design",
    "assert_tattoo_brief",
    "design_schema",
    "is_valid",
    "is_valid_design",
    "is_valid_tattoo_brief",
    "schema",
    "tattoo_brief_schema",
    "validate",
    "validate_design",
    "validate_tattoo_brief",
]
