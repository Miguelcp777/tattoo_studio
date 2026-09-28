"""Pipeline state and the injected ports the nodes operate through.

The orchestrator owns *ordering and invariants*, never imaging. Every concrete operation — making
artwork, tracing the master, compositing, blending, moderating — is supplied by the composition
root as a ``GenerationDeps`` plus optional ports. Consequently this module imports no worker engine
and opens no socket (ORCH-INV-001), and tests drive the pipeline with trivial fakes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

Master = Any
Raster = Any

#: The creator's finish target for the on-body mockup (TASK-0032, user request 2026-09-26): the ink
#: must read as hyperrealistic and freshly applied to skin. It is threaded to the blend so a wired
#: provider carries it as its editing instruction. The "freshly applied" look is already produced
#: geometrically by ``fresh=True`` in the composite (ADR-0014 fresh-ink halo); the blend deepens the
#: realism without touching the design (MOCKUP-INV-001). Outputs stay labelled illustrative, never a
#: prediction of the healed result (PROD-INV-005, MOCKUP-INV-004).
FRESH_TATTOO_FINISH = (
    "hyperrealistic tattoo freshly applied to skin: crisp saturated ink with the subtle sheen and "
    "surrounding redness of just-tattooed skin, natural pores, lighting and body curvature; the "
    "design's lines, shapes and proportions must not be altered"
)


class GeometryToleranceError(ValueError):
    """The AI blend moved design geometry beyond the ADR-0002/TASK-0008 tolerance.

    A ``ValueError`` so the job queue records it as an honest, user-visible failure rather than an
    opaque crash (see ``jobs.queue.JobQueue.tick``). The render fails; it never ships a mockup that
    disagrees with the stencil (PROD-INV-001, MOCKUP-INV-002).
    """


class GenerationDeps(Protocol):
    """High-level creation operations, injected by ``app.studio``.

    Kept at the altitude of whole steps so the orchestrator expresses sequence, not imaging detail,
    and so the composition root remains the single implementation of that detail — which is what
    makes the eventual delegation of ``Studio.generate`` a behaviour-preserving lift.
    """

    def make_artwork(self, state: PipelineState) -> bytes:
        """Flat native line-art or rendered/colour artwork. No body photograph is an input."""

    def trace(self, state: PipelineState, native: bytes) -> tuple[Master, Raster]:
        """Vectorise the artwork into the authoritative master and its rasterisation."""

    def master_preview(self, raster: Raster) -> bytes:
        """PNG preview of the master (the client-facing 'master' artifact)."""

    def stencil_files(self, master: Master) -> dict[str, tuple[bytes, str]]:
        """Native centerline vector exports from the master: SVG/PDF and their mirrors.

        Derived from the master, never from the mockup or a blended render (ORCH-INV-003).
        """

    def ensure_background(self, state: PipelineState) -> bytes:
        """The screened body photo when present, else a generated skin background."""

    def compose(
        self, state: PipelineState, raster: Raster, background: bytes
    ) -> tuple[bytes, dict[str, Any]]:
        """Geometric warp + multiply composite. Authoritative for design shape (MOCKUP-INV-001)."""


class BlendPort(Protocol):
    """The constrained AI blend (ADR-0016), run only on a screened body photo.

    ``blend`` returns ``None`` when no eligible provider is configured, in which case the pipeline
    keeps the geometric-only composite (ADR-0002's retained fallback). It does not judge its own
    result: that is ``GeometryCheckPort``'s job, in a separate node (TASK-0008).
    """

    def blend(
        self, warped_mockup: bytes, photo: bytes, clearance: Any, finish: str
    ) -> bytes | None: ...


class GeometryCheckPort(Protocol):
    """The load-bearing geometry check (MOCKUP-INV-002), implemented by ``mockup.geometry``.

    Kept apart from the blend so a provider never grades its own output, as ADR-0015's
    ``ai_blend -> geometry_check`` node order states.
    """

    def within_tolerance(
        self, warped_mockup: bytes, blended: bytes, transform: dict[str, Any]
    ) -> bool: ...


class OutputGatePort(Protocol):
    """Safety output gate (SEC-INV-006): screens generated imagery before it is kept."""

    def screen_output(self, image: bytes) -> bool: ...


@dataclass
class PipelineState:
    """Everything a run threads through the nodes.

    Inputs (set by the caller) and outputs (filled by nodes) share one record so a node reads what
    earlier nodes produced. The upstream flags (``rendered``, ``colour``, ``weight``, curvature and
    placement) are computed by the composition root exactly as ``Studio.generate`` does today, so
    the graph reproduces current behaviour without re-deciding them.
    """

    brief: dict[str, Any]
    references: list[bytes] = field(default_factory=list)
    analysis: Any = None

    rendered: bool = False
    colour: bool = False
    weight: float = 0.35

    # A screened body photo enables the blend; None means a generated skin background is used and
    # no photograph is involved.
    body_photo: bytes | None = None
    clearance: Any = None

    # The creator's finish target, passed to the blend (TASK-0032): hyperrealistic, freshly applied.
    finish_intent: str = FRESH_TATTOO_FINISH

    placement: dict[str, Any] | None = None
    fit_visible: bool = False
    curvature: float = 0.0
    taper: float = 0.0
    surface: float = 0.0

    # Filled by nodes.
    native: bytes | None = None
    master: Master = None
    raster: Raster = None
    background: bytes | None = None
    mockup: bytes | None = None
    transform: dict[str, Any] | None = None
    #: The blend's output, held until the geometry check accepts it; ``mockup`` stays the warp.
    blend_candidate: bytes | None = None
    blended: bool = False
    files: dict[str, tuple[bytes, str]] = field(default_factory=dict)
