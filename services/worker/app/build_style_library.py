"""Runner for the style catalogue (TASK-0028, ADR-0012).

Lives here because the composition root owns provider construction: ``generation`` may not
import ``app``, and a runner under ``scripts/`` would put an outbound model call outside the
two modules ARCH-INV-001 permits.

Run once, from ``services/worker``, with the studio credentials configured::

    uv run python -m app.build_style_library                    # everything still missing
    uv run python -m app.build_style_library --style tribal     # one style
    uv run python -m app.build_style_library --force            # regenerate what exists

Each image is a paid call, so the default skips anything already on disk.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.settings import load_settings
from app.studio import build_provider
from generation.bfl_studio import BflStudioProvider
from generation.style_library import catalogue, generate, jobs, pending

DEFAULT_OUT = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "style-library"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate style catalogue images.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--style", default=None, help="generate one style only")
    parser.add_argument("--force", action="store_true", help="regenerate images already on disk")
    args = parser.parse_args(argv)

    out = Path(args.out).resolve()
    planned = jobs(catalogue(), args.style)
    todo = pending(out, planned, force=args.force)
    print(f"{len(planned)} planned, {len(todo)} to generate, {len(planned) - len(todo)} on disk")
    if not todo:
        return 0

    provider = build_provider(load_settings())
    if not isinstance(provider, BflStudioProvider):
        print("This needs TATTOO_IMAGE_BACKEND=bfl. No call made.", file=sys.stderr)
        provider.close()
        return 1
    try:
        failures = generate(provider, provider.background_model, out, todo)
    finally:
        provider.close()

    for job, reason in failures:
        print(f"FAILED {job.style}/{job.variant}: {reason}", file=sys.stderr)
    print(f"done: {len(todo) - len(failures)} written, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
