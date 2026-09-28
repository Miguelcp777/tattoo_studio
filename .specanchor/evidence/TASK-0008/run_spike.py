"""TASK-0008 spike harness: measure how far a blend moves the design (ADR-0002, ADR-0016).

Two uses:

* ``--self-test`` (offline, no credentials): builds a synthetic corpus of skin-toned backgrounds
  and line designs, composites them with the real ``mockup.engine.composite``, and runs simulated
  blenders — some faithful (relight, retone, texture, soften), some not (moved or redrawn design).
  It shows the geometry method separates the two, which is how the real tolerance is calibrated.
* ``--corpus manifest.json --blender <name>`` (the real spike): runs a candidate provider over a
  consented or synthetic photo corpus. The provider adapters must live in ``generation``
  (ARCH-INV-001) and receive the photo only under a ``SafetyClearance`` (SEC-INV-007); none exists
  yet, so real blenders fail with the list of what is missing.

Run from ``services/worker``::

    .venv/Scripts/python.exe ../../.specanchor/evidence/TASK-0008/run_spike.py --self-test

Photos of bodies are never written into the repository: a manifest points at files kept outside it.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path.cwd()))

from mockup.engine import composite
from mockup.geometry import GeometryTolerance, geometry_report, within_tolerance

Blender = Callable[[bytes, bytes, dict[str, Any], dict[str, Any]], bytes | None]

#: Candidate limits to compare; the decided pair is TASK-0008's output, not an input.
CANDIDATE_TOLERANCES = [
    GeometryTolerance(max_p95_relative=p, min_ink_iou=iou)
    for p in (0.005, 0.01, 0.02, 0.03)
    for iou in (0.3, 0.5)
]

SKIN_TONES = [  # light to deep, top and bottom of a vertical gradient (RGB)
    ((236, 206, 188), (214, 176, 154)),
    ((214, 170, 146), (168, 120, 98)),
    ((176, 126, 94), (140, 96, 70)),
    ((120, 82, 60), (92, 62, 46)),
    ((84, 58, 44), (60, 42, 32)),
]


def _png(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _skin(tone: tuple[tuple[int, int, int], tuple[int, int, int]], seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    top, bottom = (np.array(c, dtype=np.float32) for c in tone)
    ys = np.linspace(0, 1, 1200)[:, None, None]
    base = np.broadcast_to(top + (bottom - top) * ys, (1200, 900, 3)).copy()
    base += rng.normal(0, 4, base.shape)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def _design(variant: int, drop: bool = False) -> Image.Image:
    art = Image.new("RGB", (600, 800), "white")
    draw = ImageDraw.Draw(art)
    draw.ellipse((80, 120, 520, 560), outline="black", width=14)
    draw.line((300, 40, 300, 760), fill="black", width=12)
    if not drop:
        draw.line((60, 340 + 20 * variant, 540, 340 + 20 * variant), fill="black", width=12)
    draw.polygon([(250, 600), (350, 600), (300, 720)], fill="black")
    return art


def synthetic_corpus(count: int) -> list[dict[str, Any]]:
    cases = []
    for i in range(count):
        tone = SKIN_TONES[i % len(SKIN_TONES)]
        cases.append(
            {
                "id": f"synthetic-{i:02d}",
                "photo": _png(_skin(tone, seed=i)),
                "master": _design(i % 3),
                "size": {"widthMm": 90, "heightMm": 120},
                "placement": {"x": 0.25 + 0.02 * (i % 4), "y": 0.2, "width": 0.4},
                "attributes": {"tone": i % len(SKIN_TONES), "synthetic": True},
            }
        )
    return cases


# --- simulated blenders for the self-test ---------------------------------------------------


def faithful(warped: bytes, photo: bytes, case: dict[str, Any], _t: dict[str, Any]) -> bytes:
    """Relight, retone, re-texture and soften: what ADR-0002 allows."""
    with Image.open(io.BytesIO(warped)) as source:
        arr = np.asarray(source.convert("RGB"), dtype=np.float32) / 255
    relit = (arr**1.12) * 0.9 + 0.05
    noise = np.random.default_rng(7).normal(0, 5, relit.shape)
    out = Image.fromarray(np.clip(relit * 255 + noise, 0, 255).astype(np.uint8))
    return _png(out.filter(ImageFilter.GaussianBlur(1.0)))


def moved(warped: bytes, photo: bytes, case: dict[str, Any], _t: dict[str, Any]) -> bytes:
    """The design drifts by about 3% of the frame: a redraw that looks plausible."""
    placement = {**case["placement"], "x": case["placement"]["x"] + 0.03}
    out, _ = composite(case["master"], photo, case["size"], placement, fresh=True)
    return out


def redrawn(warped: bytes, photo: bytes, case: dict[str, Any], _t: dict[str, Any]) -> bytes:
    """An element of the design is lost: the ink is no longer the same artwork."""
    master = _design(0, drop=True)
    out, _ = composite(master, photo, case["size"], case["placement"], fresh=True)
    return out


SELF_TEST_BLENDERS: dict[str, tuple[Blender, bool]] = {
    # name -> (blender, should it pass a sound tolerance?)
    "faithful": (faithful, True),
    "moved": (moved, False),
    "redrawn": (redrawn, False),
}


def real_blender(name: str) -> Blender:
    raise SystemExit(
        f"Blender '{name}' is not available. The real spike needs, per candidate: an image-edit "
        "adapter in services/worker/generation (ARCH-INV-001) accepting the photo only under a "
        "SafetyClearance (SEC-INV-007); the provider's credential; its data-handling terms read "
        "and recorded (SEC-INV-001); and a consented or synthetic corpus manifest. See "
        ".specanchor/tasks/TASK-0008.spec.md."
    )


def run(cases: list[dict[str, Any]], blenders: dict[str, Blender]) -> dict[str, Any]:
    rows = []
    for case in cases:
        warped, transform = composite(
            case["master"], case["photo"], case["size"], case["placement"], fresh=True
        )
        for name, blend in blenders.items():
            started = time.perf_counter()
            candidate = blend(warped, case["photo"], case, transform)
            elapsed = time.perf_counter() - started
            if candidate is None:
                rows.append({"case": case["id"], "blender": name, "declined": True})
                continue
            report = geometry_report(warped, candidate, transform)
            rows.append(
                {
                    "case": case["id"],
                    "blender": name,
                    "attributes": case.get("attributes", {}),
                    "seconds": round(elapsed, 3),
                    **{k: (None if v == float("inf") else v) for k, v in asdict(report).items()},
                    "passes": {
                        f"p95<={t.max_p95_relative},iou>={t.min_ink_iou}": within_tolerance(
                            report, t
                        )
                        for t in CANDIDATE_TOLERANCES
                    },
                }
            )
    summary: dict[str, Any] = {}
    for name in blenders:
        mine = [r for r in rows if r["blender"] == name and not r.get("declined")]
        rel = [r["p95_relative"] for r in mine if r["p95_relative"] is not None]
        summary[name] = {
            "cases": len(mine),
            "p95_relative_max": max(rel) if rel else None,
            "p95_relative_min": min(rel) if rel else None,
            "pass_rate": {
                key: sum(r["passes"][key] for r in mine) / len(mine) if mine else None
                for key in (mine[0]["passes"] if mine else {})
            },
        }
    return {"summary": summary, "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--cases", type=int, default=10)
    parser.add_argument("--corpus", type=Path)
    parser.add_argument("--blender", action="append", default=[])
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.self_test:
        result = run(
            synthetic_corpus(args.cases), {n: b for n, (b, _) in SELF_TEST_BLENDERS.items()}
        )
        expected = {n: ok for n, (_, ok) in SELF_TEST_BLENDERS.items()}
        separating = [
            key
            for key in result["summary"]["faithful"]["pass_rate"]
            if all(
                result["summary"][n]["pass_rate"][key] == (1.0 if ok else 0.0)
                for n, ok in expected.items()
            )
        ]
        result["separating_tolerances"] = separating
        result["verdict"] = "SEPARATES" if separating else "DOES_NOT_SEPARATE"
    else:
        if not args.corpus or not args.blender:
            parser.error("the real spike needs --corpus and at least one --blender")
        raise SystemExit(real_blender(args.blender[0]))

    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "summary": result["summary"],
                "verdict": result["verdict"],
                "separating_tolerances": result["separating_tolerances"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
