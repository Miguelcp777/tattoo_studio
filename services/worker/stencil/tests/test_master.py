"""The vector master is the authoritative geometry (ADR-0007) and must resize exactly."""

from __future__ import annotations

import pytest

from stencil.engine import Master, deserialize_master, export_svg, rescale, serialize_master


def sample() -> Master:
    return Master([[(0.0, 0.0), (10.0, 20.0)], [(5.0, 5.0), (8.0, 18.0)]], 20.0, 40.0, 0.3, "a")


def test_serialisation_round_trip_preserves_the_geometry() -> None:
    """TASK-0024/AC-005: persisting a raster alone left no exact path back to the vector."""
    restored = deserialize_master(serialize_master(sample()))
    assert restored.paths == sample().paths
    assert (restored.width_mm, restored.height_mm) == (20.0, 40.0)
    assert restored.stroke_mm == 0.3
    assert restored.source_hash == "a"


def test_rescale_is_an_exact_similarity() -> None:
    """TASK-0024/AC-005: a resize scales the vector; it never re-traces (ADR-0003)."""
    master = sample()
    scaled = rescale(master, 40.0, 80.0)
    assert scaled.stroke_mm == pytest.approx(master.stroke_mm * 2)
    for original, result in zip(master.paths, scaled.paths, strict=True):
        for (x, y), (sx, sy) in zip(original, result, strict=True):
            assert sx == pytest.approx(x * 2, abs=1e-9)
            assert sy == pytest.approx(y * 2, abs=1e-9)
    assert b'width="40.0mm"' in export_svg(scaled)
    assert scaled.design_hash != master.design_hash


def test_rescale_centres_when_the_target_aspect_differs() -> None:
    scaled = rescale(sample(), 40.0, 100.0)
    assert scaled.width_mm == 40.0 and scaled.height_mm == 100.0
    ys = [y for path in scaled.paths for _, y in path]
    assert min(ys) == pytest.approx(10.0)


def test_an_unknown_vector_document_is_refused() -> None:
    with pytest.raises(ValueError, match="no reconocido"):
        deserialize_master(b'{"version": 2, "paths": []}')


def test_rescale_rejects_a_non_positive_size() -> None:
    with pytest.raises(ValueError, match="positivas"):
        rescale(sample(), 0.0, 10.0)
