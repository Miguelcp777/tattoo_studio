"""The creation-pipeline nodes.

Each factory closes over the injected dependency and returns a ``PipelineState -> PipelineState``
function. The order in which ``pipeline.build_generation_graph`` wires them is the ADR-0015
contract; each node here enforces its own slice of that contract.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

from .state import (
    BlendPort,
    GenerationDeps,
    GeometryCheckPort,
    GeometryToleranceError,
    OutputGatePort,
    PipelineState,
)

Node = Callable[[PipelineState], PipelineState]


def master_artwork_node(deps: GenerationDeps) -> Node:
    """Produce the flat master and its rasterisation. No body photograph is an input here.

    The artwork operations receive a view of the state with the photo and its clearance removed,
    so no adapter can feed the body photograph to image generation even by mistake (ADR-0007).
    """

    def run(state: PipelineState) -> PipelineState:
        view = replace(state, body_photo=None, clearance=None)
        native = state.native if state.native is not None else deps.make_artwork(view)
        state.native = native
        state.master, state.raster = deps.trace(view, native)
        return state

    return run


def stencil_trace_node(deps: GenerationDeps) -> Node:
    """Export the thermal stencil from the master geometry (ORCH-INV-003, ADR-0003)."""

    def run(state: PipelineState) -> PipelineState:
        if state.master is None:
            raise ValueError("stencil_trace requires a master; master_artwork must run first")
        state.files.update(deps.stencil_files(state.master))
        state.files["master"] = (deps.master_preview(state.raster), "image/png")
        return state

    return run


def surface_warp_node(deps: GenerationDeps) -> Node:
    """Resolve the background and produce the authoritative geometric composite (pre-blend warp)."""

    def run(state: PipelineState) -> PipelineState:
        if state.raster is None:
            raise ValueError("surface_warp requires a raster; master_artwork must run first")
        state.background = state.background or deps.ensure_background(state)
        state.mockup, state.transform = deps.compose(state, state.raster, state.background)
        return state

    return run


def ai_blend_node(blend: BlendPort | None) -> Node:
    """Constrained AI blend on the screened photo (ADR-0016). Proposes; never accepts.

    Runs only with a body photo, an eligible provider and a clearance. When the provider is absent
    or declines, it is a no-op and the geometric composite stands (the ADR-0002 fallback). The
    finish target — hyperrealistic, freshly-applied ink (``state.finish_intent``) — is the blend's
    instruction. Its output waits in ``blend_candidate`` for the geometry check.
    """

    def run(state: PipelineState) -> PipelineState:
        if blend is None or state.body_photo is None or state.mockup is None:
            return state
        state.blend_candidate = blend.blend(
            state.mockup, state.body_photo, state.clearance, state.finish_intent
        )
        return state

    return run


def geometry_check_node(check: GeometryCheckPort | None) -> Node:
    """Accept the blend only if the design did not move (MOCKUP-INV-002, ORCH-INV-004).

    A candidate outside tolerance fails the render rather than shipping a design that disagrees
    with the stencil. A candidate with no check configured fails too: the check is load-bearing
    (ADR-0002), so a blend can never be accepted unverified.
    """

    def run(state: PipelineState) -> PipelineState:
        candidate = state.blend_candidate
        if candidate is None:
            return state
        if (
            check is None
            or state.mockup is None
            or state.transform is None
            or not check.within_tolerance(state.mockup, candidate, state.transform)
        ):
            raise GeometryToleranceError(
                "El acabado sobre la piel alteró el diseño más de lo permitido, "
                "así que no se ha entregado. Vuelve a intentarlo."
            )
        state.mockup = candidate
        state.blended = True
        state.blend_candidate = None
        return state

    return run


def output_gate_node(gate: OutputGatePort | None) -> Node:
    """Screen the generated mockup before it can be stored or shown (SEC-INV-006)."""

    def run(state: PipelineState) -> PipelineState:
        if gate is None or state.mockup is None:
            return state
        if not gate.screen_output(state.mockup):
            raise ValueError("La imagen generada no superó la revisión de contenido.")
        return state

    return run


def assemble_node() -> Node:
    """Finalise the in-memory artifact set. Persistence stays with the composition root (media)."""

    def run(state: PipelineState) -> PipelineState:
        if state.mockup is None or state.background is None:
            raise ValueError("assemble requires a composited mockup and background")
        state.files["mockup"] = (state.mockup, "image/png")
        state.files["background"] = (state.background, "image/png")
        return state

    return run
