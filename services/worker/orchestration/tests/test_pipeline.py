"""Ordering-and-invariant tests for the creation pipeline, driven by fake dependencies.

These prove the graph's contract (TASK-0032): the node order, that the stencil derives from the
master and not the mockup, that the geometric-only path is the default when no blend provider is
configured, that a blend outside tolerance falls back to the geometric composite (ADR-0018), and
that the module opens no socket.
The imaging itself is faked; its real behaviour is the composition root's, verified by the studio
suite when ``Studio.generate`` is delegated to this graph.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from orchestration import (
    PipelineState,
    build_generation_graph,
)


@dataclass
class FakeMaster:
    content: bytes


class FakeDeps:
    """A deterministic ``GenerationDeps``. Records whether the body photo ever reached artwork."""

    def __init__(self) -> None:
        self.artwork_saw_photo = False

    def make_artwork(self, state: PipelineState) -> bytes:
        self.artwork_saw_photo |= state.body_photo is not None or state.clearance is not None
        return b"NATIVE"

    def trace(self, state: PipelineState, native: bytes) -> tuple[FakeMaster, bytes]:
        self.artwork_saw_photo |= state.body_photo is not None or state.clearance is not None
        return FakeMaster(b"M:" + native), b"RASTER"

    def master_preview(self, raster: bytes) -> bytes:
        return b"PREVIEW"

    def stencil_files(self, master: FakeMaster) -> dict[str, tuple[bytes, str]]:
        # Deterministic in the master alone, so a change to the mockup cannot change the stencil.
        return {
            "stencil": (b"SVG:" + master.content, "image/svg+xml"),
            "stencilMirror": (b"SVGM:" + master.content, "image/svg+xml"),
            "pdf": (b"PDF:" + master.content, "application/pdf"),
            "pdfMirror": (b"PDFM:" + master.content, "application/pdf"),
        }

    def ensure_background(self, state: PipelineState) -> bytes:
        return state.body_photo or b"GENERATED_BG"

    def compose(
        self, state: PipelineState, raster: bytes, background: bytes
    ) -> tuple[bytes, dict[str, Any]]:
        return b"GEOMETRIC_MOCKUP", {"widthPx": 100, "curvature": state.curvature}


class FakeBlend:
    def __init__(self, result: bytes | None) -> None:
        self.result = result
        self.calls = 0
        self.finish: str | None = None
        self.photo: bytes | None = None

    def blend(
        self, warped_mockup: bytes, photo: bytes | None, clearance: object, finish: str
    ) -> bytes | None:
        self.calls += 1
        self.finish = finish
        self.photo = photo
        return self.result


class FakeCheck:
    def __init__(self, passes: bool) -> None:
        self.passes = passes
        self.seen: tuple[bytes, bytes, dict[str, Any]] | None = None

    def within_tolerance(
        self, warped_mockup: bytes, blended: bytes, transform: dict[str, Any]
    ) -> bool:
        self.seen = (warped_mockup, blended, transform)
        return self.passes


def _state(**kw: object) -> PipelineState:
    base: dict[str, object] = {"brief": {"subject": {"description": "a fox"}}, "references": []}
    base.update(kw)
    return PipelineState(**base)  # type: ignore[arg-type]


def test_node_order_matches_the_adr() -> None:
    graph = build_generation_graph(FakeDeps())
    assert graph.node_order() == [
        "master_artwork",
        "stencil_trace",
        "surface_warp",
        "ai_blend",
        "geometry_check",
        "output_gate",
        "assemble",
    ]


def test_geometric_only_is_the_default_path() -> None:
    graph = build_generation_graph(FakeDeps())
    out = graph.invoke(_state())
    assert out.blended is False
    assert out.mockup == b"GEOMETRIC_MOCKUP"
    assert out.files["mockup"] == (b"GEOMETRIC_MOCKUP", "image/png")
    # Both print assets and the mirror sheets are present (AC-008 shape).
    for key in ("stencil", "stencilMirror", "pdf", "pdfMirror", "master", "background"):
        assert key in out.files


def test_stencil_is_identical_whether_or_not_the_blend_runs() -> None:
    """AC-007 shape: the stencil is a function of the master, never of the mockup."""
    without = build_generation_graph(FakeDeps()).invoke(_state())
    with_blend = build_generation_graph(
        FakeDeps(), blend=FakeBlend(b"BLENDED_SKIN"), geometry=FakeCheck(True)
    ).invoke(_state(body_photo=b"PHOTO", clearance=object()))

    assert with_blend.blended is True
    assert with_blend.mockup == b"BLENDED_SKIN"
    for key in ("stencil", "stencilMirror", "pdf", "pdfMirror"):
        assert without.files[key] == with_blend.files[key]


def test_blend_receives_the_hyperrealistic_fresh_finish() -> None:
    """The creator's finish target reaches the blend (user request 2026-09-26)."""
    blend = FakeBlend(b"BLENDED_SKIN")
    build_generation_graph(FakeDeps(), blend=blend, geometry=FakeCheck(True)).invoke(
        _state(body_photo=b"PHOTO", clearance=object())
    )
    assert blend.finish is not None
    assert "hyperrealistic" in blend.finish and "freshly applied" in blend.finish


def test_blend_runs_on_a_generated_plate_with_no_photograph() -> None:
    """ADR-0018: a generated skin plate involves no one's photograph, so it may be finished."""
    blend = FakeBlend(b"BLENDED_SKIN")
    out = build_generation_graph(FakeDeps(), blend=blend, geometry=FakeCheck(True)).invoke(
        _state(body_photo=None)
    )
    assert blend.calls == 1 and blend.photo is None
    assert out.blended is True and out.blend_outcome == "accepted"
    assert out.warp == b"GEOMETRIC_MOCKUP"


def test_an_own_photo_without_its_clearance_is_never_sent() -> None:
    blend = FakeBlend(b"BLENDED_SKIN")
    out = build_generation_graph(FakeDeps(), blend=blend, geometry=FakeCheck(True)).invoke(
        _state(body_photo=b"PHOTO", clearance=None)
    )
    assert blend.calls == 0
    assert out.blended is False and out.blend_outcome == "declined"


def test_a_failing_provider_keeps_the_geometric_composite() -> None:
    class Broken:
        def blend(self, *args: object) -> bytes | None:
            raise RuntimeError("provider down, request quoted here")

    out = build_generation_graph(FakeDeps(), blend=Broken(), geometry=FakeCheck(True)).invoke(
        _state()
    )
    assert out.mockup == b"GEOMETRIC_MOCKUP"
    assert out.blend_outcome == "unavailable"


def test_absent_provider_keeps_the_geometric_composite() -> None:
    blend = FakeBlend(None)  # provider not eligible / not configured yet (TASK-0008)
    out = build_generation_graph(FakeDeps(), blend=blend).invoke(
        _state(body_photo=b"PHOTO", clearance=object())
    )
    assert blend.calls == 1
    assert out.blended is False
    assert out.mockup == b"GEOMETRIC_MOCKUP"


def test_out_of_tolerance_blend_falls_back_to_the_warp() -> None:
    """ADR-0018: the stencil-faithful composite is delivered instead of failing the job."""
    out = build_generation_graph(
        FakeDeps(), blend=FakeBlend(b"REDRAWN"), geometry=FakeCheck(False)
    ).invoke(_state())
    assert out.mockup == b"GEOMETRIC_MOCKUP"
    assert out.files["mockup"] == (b"GEOMETRIC_MOCKUP", "image/png")
    assert out.blended is False and out.blend_outcome == "rejected_geometry"


def test_a_blend_is_never_accepted_without_a_geometry_check() -> None:
    """The check is load-bearing (ADR-0002): no check means no acceptance, not a free pass."""
    out = build_generation_graph(FakeDeps(), blend=FakeBlend(b"BLENDED_SKIN")).invoke(_state())
    assert out.mockup == b"GEOMETRIC_MOCKUP"
    assert out.blend_outcome == "rejected_geometry"


def test_the_check_compares_the_warp_with_the_candidate_and_its_transform() -> None:
    check = FakeCheck(True)
    build_generation_graph(FakeDeps(), blend=FakeBlend(b"BLENDED_SKIN"), geometry=check).invoke(
        _state(body_photo=b"PHOTO", clearance=object())
    )
    assert check.seen is not None
    assert check.seen[0] == b"GEOMETRIC_MOCKUP" and check.seen[1] == b"BLENDED_SKIN"
    assert check.seen[2]["widthPx"] == 100


def test_master_artwork_never_sees_the_body_photo_or_its_clearance() -> None:
    deps = FakeDeps()
    build_generation_graph(deps).invoke(_state(body_photo=b"PHOTO", clearance=object()))
    assert deps.artwork_saw_photo is False


def test_output_gate_rejection_stops_the_render() -> None:
    class DenyGate:
        def screen_output(self, image: bytes) -> bool:
            return False

    with pytest.raises(ValueError, match="revisión de contenido"):
        build_generation_graph(FakeDeps(), output_gate=DenyGate()).invoke(_state())


def test_a_blend_the_output_gate_rejects_falls_back_to_the_warp() -> None:
    class DenyBlended:
        def screen_output(self, image: bytes) -> bool:
            return image != b"BLENDED_SKIN"

    out = build_generation_graph(
        FakeDeps(),
        blend=FakeBlend(b"BLENDED_SKIN"),
        geometry=FakeCheck(True),
        output_gate=DenyBlended(),
    ).invoke(_state())
    assert out.mockup == b"GEOMETRIC_MOCKUP"
    assert out.blended is False and out.blend_outcome == "rejected_output"


def test_module_opens_no_socket() -> None:
    """ORCH-INV-001, locally: no orchestration source imports a network client."""
    network = {
        "httpx",
        "httpx2",
        "requests",
        "urllib",
        "urllib3",
        "http",
        "aiohttp",
        "socket",
        "openai",
        "anthropic",
        "fal_client",
        "replicate",
    }
    root = Path(__file__).resolve().parents[1]
    offenders: list[str] = []
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        roots: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                roots |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                roots.add(node.module.split(".")[0])
        if roots & network:
            offenders.append(f"{path.name}: {sorted(roots & network)}")
    assert not offenders, offenders
