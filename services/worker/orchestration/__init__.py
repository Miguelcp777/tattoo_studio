"""Tier-2 creation pipeline (TASK-0032, ADR-0015).

Sequences the generation-time work — master artwork, stencil, mockup, the constrained AI
blend (ADR-0016) and the output gate — as a small state graph. It orchestrates only: every
image, imaging and moderation operation is injected (``GenerationDeps`` and the ports), so this
module imports no worker engine and performs no outbound egress (ORCH-INV-001).
"""

from __future__ import annotations

from .graph import END, Graph
from .pipeline import build_finish_graph, build_generation_graph
from .state import (
    BlendPort,
    GenerationDeps,
    GeometryCheckPort,
    OutputGatePort,
    PipelineState,
)

__all__ = [
    "END",
    "BlendPort",
    "GenerationDeps",
    "GeometryCheckPort",
    "Graph",
    "OutputGatePort",
    "PipelineState",
    "build_finish_graph",
    "build_generation_graph",
]
