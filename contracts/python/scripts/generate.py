"""Generate Python artifacts from the canonical schema.

Two outputs, both committed (ADR-0004 refinement, TASK-0002/DEC-003):

    tattoo_contracts/schemas/tattoo-brief.schema.json   byte-identical copy
    tattoo_contracts/generated/tattoo_brief.py          pydantic models, ergonomics only

The copy exists so the package can be installed and still find its schema without
reaching outside its own tree. A test asserts it is byte-identical to the canonical
file, so the two provably cannot drift.

The pydantic models carry no validating authority. They cannot express the schema's
conditional colour rules, so treating them as the validator would silently accept
payloads the schema rejects. `tattoo_contracts.validation` is the authority.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent / "tattoo_contracts"
CANONICAL = HERE.parents[1] / "schemas" / "tattoo-brief.schema.json"

BANNER = """\
# GENERATED FILE - DO NOT EDIT.
#
# Source: contracts/schemas/tattoo-brief.schema.json
# Regenerate: uv run python scripts/generate.py  (from contracts/python)
#
# Editing this by hand fails the codegen reproducibility check.
# These models are ergonomics only. Validation authority is tattoo_contracts.validation.
"""


def main() -> int:
    if not CANONICAL.is_file():
        print(f"canonical schema not found: {CANONICAL}", file=sys.stderr)
        return 1

    schema_dir = PACKAGE / "schemas"
    schema_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(CANONICAL, schema_dir / CANONICAL.name)

    generated_dir = PACKAGE / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    (generated_dir / "__init__.py").write_text(
        '"""Generated artifacts. Do not edit by hand."""\n', encoding="utf-8"
    )

    target = generated_dir / "tattoo_brief.py"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(CANONICAL),
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
    print(f"copied:    {(schema_dir / CANONICAL.name).relative_to(PACKAGE.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
