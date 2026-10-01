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


def _large_drawing(colour: bool) -> bytes:
    import io

    from PIL import Image, ImageDraw

    image = Image.new("RGB", (2000, 3000), "white")
    draw = ImageDraw.Draw(image)
    if colour:
        draw.ellipse((300, 300, 1700, 2700), fill="red")
    else:
        draw.ellipse((300, 300, 1700, 2700), outline="black", width=12)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


@pytest.mark.parametrize("colour", [False, True])
def test_a_dense_design_is_traced_at_coarser_detail(
    monkeypatch: pytest.MonkeyPatch, colour: bool
) -> None:
    """TASK-0071: a detailed design used to fail the whole generation at the first, finest pass."""
    from stencil import engine

    shapes: list[tuple[int, ...]] = []
    real = engine._trace_mask

    def dense_twice(ink, *args):  # type: ignore[no-untyped-def]
        shapes.append(ink.shape)
        if len(shapes) <= 2:
            raise engine._TooComplexError(engine.TOO_COMPLEX)
        return real(ink, *args)

    monkeypatch.setattr(engine, "_trace_mask", dense_twice)
    if colour:
        master, _ = engine.trace_colour_artwork(_large_drawing(True), 80, 120)
    else:
        master = engine.trace_native_lineart(_large_drawing(False), 80, 120)
    assert master.paths and len(shapes) == 3
    # Line-art gets smaller each pass; colour first smooths its edges at the same size.
    expected = (
        [(1536, 1024), (1536, 1024), (1152, 768)]
        if colour
        else [
            (1536, 1024),
            (1152, 768),
            (864, 576),
        ]
    )
    assert shapes == expected
    # TASK-0086 (audit ARQ-03): the client is told how many coarser passes it took.
    assert master.simplification == 2


def test_the_simplification_level_is_not_part_of_the_design_identity() -> None:
    a = sample()
    b = sample()
    b.simplification = 3
    assert a.design_hash == b.design_hash


def test_a_design_too_dense_at_every_pass_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    from stencil import engine

    def always(ink, *args):  # type: ignore[no-untyped-def]
        raise engine._TooComplexError(engine.TOO_COMPLEX)

    monkeypatch.setattr(engine, "_trace_mask", always)
    with pytest.raises(ValueError, match="demasiado complejo") as refused:
        engine.trace_native_lineart(_large_drawing(False), 80, 120)
    assert type(refused.value) is ValueError
