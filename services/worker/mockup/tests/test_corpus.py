"""The geometry check against its synthetic corpus (TASK-0087, audit ARQ-02)."""

from __future__ import annotations

from mockup.corpus import evaluate
from mockup.geometry import BLEND_TOLERANCE, GeometryTolerance

GLOBAL_ONLY = GeometryTolerance(
    max_p95_relative=BLEND_TOLERANCE.max_p95_relative,
    min_ink_iou=BLEND_TOLERANCE.min_ink_iou,
)
#: The lightest and the darkest skin keep the test quick; `python -m mockup.corpus` runs all three.
TONES = ("light", "dark")


def test_the_local_limit_catches_redraws_the_global_one_misses() -> None:
    global_only = evaluate(GLOBAL_ONLY, TONES)
    local = evaluate(BLEND_TOLERANCE, TONES)
    # The global limits alone let small redraws through: an emblem, a letter.
    assert any("emblem_redrawn" in case for case in global_only.false_accepts)
    assert any("letter_changed" in case for case in global_only.false_accepts)
    # With the local limit, none.
    assert local.false_accepts == []
    # And no faithful finish is refused that the global limits accepted.
    assert local.false_rejects == global_only.false_rejects
