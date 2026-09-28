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
    """Constrained AI blend on the composite (ADR-0016, ADR-0018). Proposes; never accepts.

    Runs on a generated skin plate, where no photograph of anyone is involved, and on an own photo
    only with its clearance (the adapter still declines own photos until GEN-INV-002 is verified).
    A missing, declining or failing provider is a no-op and the geometric composite stands (the
    ADR-0002 fallback). The finish target is the blend's instruction; its output waits in
    ``blend_candidate`` for the geometry check.
    """

    def run(state: PipelineState) -> PipelineState:
        if blend is None or state.mockup is None:
            return state
        if state.body_photo is not None and state.clearance is None:
            state.blend_outcome = "declined"
            return state
        try:
            candidate = blend.blend(
                state.mockup, state.body_photo, state.clearance, state.finish_intent
            )
        except Exception:
            # Deliberately broad: a finish that could not be produced costs the client nothing
            # but the finish. The provider's message may quote the request, so it is not kept.
            state.blend_outcome = "unavailable"
            return state
        if candidate is None:
            state.blend_outcome = "declined"
        state.blend_candidate = candidate
        return state

    return run


def geometry_check_node(check: GeometryCheckPort | None) -> Node:
    """Accept the blend only if the design did not move (MOCKUP-INV-002, ORCH-INV-004).

    A candidate outside tolerance is discarded and the geometric composite, which agrees with the
    stencil by construction, is delivered instead (ADR-0018). A candidate with no check configured
    is discarded too: the check is load-bearing (ADR-0002), so a blend is never accepted unverified.
    """

    def run(state: PipelineState) -> PipelineState:
        candidate = state.blend_candidate
        if candidate is None:
            return state
        state.blend_candidate = None
        if (
            check is None
            or state.mockup is None
            or state.transform is None
            or not check.within_tolerance(state.mockup, candidate, state.transform)
        ):
            state.blend_outcome = "rejected_geometry"
            return state
        state.warp = state.mockup
        state.mockup = candidate
        state.blended = True
        state.blend_outcome = "accepted"
        return state

    return run


def output_gate_node(gate: OutputGatePort | None) -> Node:
    """Screen the mockup before it can be stored or shown (SEC-INV-006).

    A rejected blend falls back to the geometric composite it was made from; a rejected composite
    stops the render.
    """

    def run(state: PipelineState) -> PipelineState:
        if gate is None or state.mockup is None:
            return state
        if gate.screen_output(state.mockup):
            return state
        if state.blended and state.warp is not None:
            state.mockup, state.warp = state.warp, None
            state.blended = False
            state.blend_outcome = "rejected_output"
            return state
        raise ValueError("La imagen generada no superó la revisión de contenido.")

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
