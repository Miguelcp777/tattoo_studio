"""Assemble the creation graph in the ADR-0015 order.

    skin_plate -> master_artwork -> stencil_trace -> surface_warp -> ai_blend
        -> geometry_check -> output_gate -> assemble

``skin_plate`` leads (TASK-0052): a plate provider that fails must fail before the artwork is paid
for, not after it.

The order is the contract: the stencil is traced from the master (never the mockup), the blend
runs on the geometric warp and only proposes, the geometry check alone may accept it, and nothing
is assembled until the output gate passes. Swapping ``Graph`` for ``langgraph.StateGraph`` leaves
this wiring unchanged.
"""

from __future__ import annotations

from .graph import END, Graph
from .nodes import (
    ai_blend_node,
    assemble_node,
    geometry_check_node,
    master_artwork_node,
    output_gate_node,
    skin_plate_node,
    stencil_trace_node,
    surface_warp_node,
)
from .state import BlendPort, GenerationDeps, GeometryCheckPort, OutputGatePort, PipelineState


def build_generation_graph(
    deps: GenerationDeps,
    *,
    blend: BlendPort | None = None,
    geometry: GeometryCheckPort | None = None,
    output_gate: OutputGatePort | None = None,
) -> Graph[PipelineState]:
    """Build the pipeline. ``blend`` stays ``None`` until a provider passes TASK-0008, so by
    default the graph produces the geometric-only mockup and both print assets (ADR-0016 fallback).
    A blend without a ``geometry`` check can propose but never be accepted.
    """
    graph: Graph[PipelineState] = Graph()
    graph.add_node("skin_plate", skin_plate_node(deps))
    graph.add_node("master_artwork", master_artwork_node(deps))
    graph.add_node("stencil_trace", stencil_trace_node(deps))
    graph.add_node("surface_warp", surface_warp_node(deps))
    graph.add_node("ai_blend", ai_blend_node(blend))
    graph.add_node("geometry_check", geometry_check_node(geometry))
    graph.add_node("output_gate", output_gate_node(output_gate))
    graph.add_node("assemble", assemble_node())

    graph.set_entry_point("skin_plate")
    graph.add_edge("skin_plate", "master_artwork")
    graph.add_edge("master_artwork", "stencil_trace")
    graph.add_edge("stencil_trace", "surface_warp")
    graph.add_edge("surface_warp", "ai_blend")
    graph.add_edge("ai_blend", "geometry_check")
    graph.add_edge("geometry_check", "output_gate")
    graph.add_edge("output_gate", "assemble")
    graph.add_edge("assemble", END)
    return graph


def build_finish_graph(
    *,
    blend: BlendPort | None = None,
    geometry: GeometryCheckPort | None = None,
    output_gate: OutputGatePort | None = None,
) -> Graph[PipelineState]:
    """The finish alone, for a mockup re-placed without new artwork (TASK-0040).

    Same nodes, same order as the tail of the creation graph, so a resized or moved design is held
    to the same blend -> geometry check -> output gate contract rather than a second copy of it.
    The state must already carry ``mockup`` and ``transform``.
    """
    graph: Graph[PipelineState] = Graph()
    graph.add_node("ai_blend", ai_blend_node(blend))
    graph.add_node("geometry_check", geometry_check_node(geometry))
    graph.add_node("output_gate", output_gate_node(output_gate))
    graph.set_entry_point("ai_blend")
    graph.add_edge("ai_blend", "geometry_check")
    graph.add_edge("geometry_check", "output_gate")
    graph.add_edge("output_gate", END)
    return graph
