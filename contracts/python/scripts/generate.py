"""Generate Python artifacts from the canonical schemas.

For every ``contracts/schemas/*.schema.json``, two outputs, both committed
(ADR-0004 refinement, TASK-0002/DEC-003):

    tattoo_contracts/schemas/<name>.schema.json   byte-identical copy
    tattoo_contracts/generated/<name>.py          pydantic models, ergonomics only

The copies exist so the package can be installed and still find its schemas without
reaching outside its own tree. A test asserts each is byte-identical to the canonical
file, so the two provably cannot drift.

The pydantic models carry no validating authority. They cannot express conditional
rules such as the colour constraints on a brief, so treating them as the validator
would silently accept payloads the schema rejects. ``tattoo_contracts.validation`` is
the authority.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent / "tattoo_contracts"
SCHEMA_DIR = HERE.parents[1] / "schemas"
REFERENCE_DIR = HERE.parents[1] / "reference"

BANNER = """\
# GENERATED FILE - DO NOT EDIT.
#
# Source: contracts/schemas/
# Regenerate: uv run python scripts/generate.py  (from contracts/python)
#
# Editing this by hand fails the codegen reproducibility check.
# These models are ergonomics only. Validation authority is tattoo_contracts.validation.
"""


def _module_name(canonical: Path) -> str:
    return canonical.name.removesuffix(".schema.json").replace("-", "_")


def _generate_one(canonical: Path, generated_dir: Path) -> int:
    """Copy one schema into the package and generate its pydantic model."""
    schema_dir = PACKAGE / "schemas"
    schema_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(canonical, schema_dir / canonical.name)

    target = generated_dir / f"{_module_name(canonical)}.py"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(canonical),
            "--input-file-type",
            "jsonschema",
            "--output",
            str(target),
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--target-python-version",
            "3.11",
            # Emit Annotated[...] constraints rather than constr(...) calls. mypy
            # rejects a function call in a type annotation, so without this the
            # generated models cannot pass a strict check.
            "--use-annotated",
            "--field-constraints",
            "--custom-file-header",
            BANNER.rstrip("\n"),
            "--use-schema-description",
            "--disable-timestamp",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return result.returncode

    print(f"generated: {target.relative_to(PACKAGE.parent)}")
    print(f"copied:    {(schema_dir / canonical.name).relative_to(PACKAGE.parent)}")
    return 0


def main() -> int:
    schemas = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if not schemas:
        print(f"no schemas found in {SCHEMA_DIR}", file=sys.stderr)
        return 1

    generated_dir = PACKAGE / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    (generated_dir / "__init__.py").write_text(
        '"""Generated artifacts. Do not edit by hand."""\n', encoding="utf-8"
    )

    for canonical in schemas:
        code = _generate_one(canonical, generated_dir)
        if code != 0:
            return code

    # Shared reference data (TASK-0027): copied byte-identically like the schemas, so the
    # consultation and the worker cannot resolve a size from different numbers.
    reference_dir = PACKAGE / "reference"
    reference_dir.mkdir(parents=True, exist_ok=True)
    (reference_dir / "__init__.py").write_text(
        '"""Copied reference data. Do not edit by hand."""\n', encoding="utf-8"
    )
    for canonical in sorted(REFERENCE_DIR.glob("*.json")):
        shutil.copyfile(canonical, reference_dir / canonical.name)
        print(f"copied:    {(reference_dir / canonical.name).relative_to(PACKAGE.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
