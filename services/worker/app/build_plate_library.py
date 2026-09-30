"""Generate the skin plate library (TASK-0060, ADR-0027).

    uv run python -m app.build_plate_library                      # everything still missing
    uv run python -m app.build_plate_library --zone thigh_front   # one zone, both bodies
    uv run python -m app.build_plate_library --force --zone hip   # regenerate what exists

Each plate is a paid call, so the default skips anything already on disk. Always OpenAI, whatever
TATTOO_IMAGE_BACKEND says: the library replaces the plates OpenAI draws in production. Review every
image before committing it.
"""

from __future__ import annotations

import argparse
import sys

from app.settings import load_settings
from generation.plate_library import PLATES, build, planned
from generation.studio import StudioProvider


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the skin plate library.")
    parser.add_argument("--zone", action="append", help="one zone; repeat for several")
    parser.add_argument("--body", action="append", choices=["masculine", "feminine"])
    parser.add_argument("--force", action="store_true", help="regenerate plates already on disk")
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.openai_api_key is None:
        print("OPENAI_API_KEY is required. No call made.", file=sys.stderr)
        return 1
    provider = StudioProvider(
        settings.openai_api_key.get_secret_value(), settings.image_model, settings.vision_model
    )
    plates = planned(args.zone, args.body)
    try:
        failures = build(provider.background, PLATES, plates, force=args.force)
    finally:
        provider.close()
    for plate, reason in failures:
        print(f"FAILED {plate.filename}: {reason}", file=sys.stderr)
    print(f"done: {len(plates)} planned, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
