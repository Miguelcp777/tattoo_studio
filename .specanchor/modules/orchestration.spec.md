---
type: module-spec
module: orchestration
status: draft
source_paths:
  - services/worker/orchestration/*
last_reviewed: 2026-09-26
---

# Module: orchestration

Introduced by TASK-0032 (ADR-0015). Hosts the LangGraph graph that sequences the creation of the
two deliverables — the on-body mockup and the thermal stencil — inside a single `jobs` job. It is
the concrete implementation of the "visual creator" agent. The prompt architect and visual scout
are the interactive triad in `packages/consultation/` (Tier 1); this module is Tier 2.

## Responsibility

Sequence the generation-time pipeline as inspectable, retryable, independently testable nodes, and
enforce the ordering guarantees between them. It refactors the sequencing currently inlined in
`app/studio.py::Studio.generate` and adds the constrained AI blend (ADR-0016). It orchestrates; it
does not itself call any external model.

## Source ownership

`services/worker/orchestration/`

## Public interfaces

- `build_graph(deps) -> Graph` — construct the LangGraph pipeline from injected module callables.
- `run(job_input) -> StudioResult` — execute the graph for one accepted brief and return the
  artifact set (master, stencil SVG/PDF, mockup, background) with derivation lineage.

## Graph nodes (ordering contract)

`master_artwork` (generation) → `stencil_trace` (stencil) → `surface_estimate` (mockup) →
`geometric_warp` (mockup) → `ai_blend` (mockup via generation) → `geometry_check` (mockup) →
`output_gate` (safety) → `assemble_result` (media). No body photograph is an input to
`master_artwork`. `stencil_trace` consumes the master, never the blended render.

## Inputs and outputs

Input: an accepted `TattooBrief` with the finalized generation prompt (from Tier 1), the screened
reference and body-photo asset ids, and their `SafetyClearance`s. Output: a `StudioResult` naming
the design version and placement it rendered. Image bytes never travel through the job queue.

## Domain invariants

- ORCH-INV-001: This module performs no outbound model or HTTP egress. Image-model calls go through
  `generation`; moderation goes through `safety` (ARCH-INV-001). A production HTTP client in this
  module is a defect the architectural test must catch.
- ORCH-INV-002: The graph runs inside one `jobs` job. It introduces no second notion of a job,
  no independent queue, and no persistence of its own.
- ORCH-INV-003: `stencil_trace` derives the stencil from the master geometry, never from the mockup
  or the blended render (ADR-0003, PROD-INV-001).
- ORCH-INV-004: `ai_blend` runs only after `geometric_warp`, and `geometry_check` runs after
  `ai_blend`; a blend whose output exceeds the ADR-0002/TASK-0008 tolerance fails the job rather
  than producing artifacts (MOCKUP-INV-002).
- ORCH-INV-005: `output_gate` runs before any generated image is stored or returned (SEC-INV-006).
- ORCH-INV-006: the creator's finish target — hyperrealistic, freshly-applied ink
  (`FRESH_TATTOO_FINISH`, user request 2026-09-26) — is passed to the blend as its editing
  instruction. It may deepen realism but never alter the design (MOCKUP-INV-001), and outputs stay
  labelled illustrative (PROD-INV-005).

## Data / persistence

None of its own. Artifacts are written through `media`; ownership/lineage rows stay in the studio's
existing tables. Mockups derived from a body photo share that photo's retention lifecycle
(SEC-INV-004).

## Dependencies

`contracts`, `generation`, `mockup`, `stencil`, `media`, `safety`, `jobs`.

Nothing depends on `orchestration` except the composition root, keeping the module graph acyclic
(ARCH-INV-006). In the implementation those engine operations are injected, so the module imports
no worker engine and opens no socket (ORCH-INV-001).

## External integrations

None directly. LangGraph is an in-process orchestration library, not a network integration.

## Error semantics

Typed, per node: artwork generation failed, stencil trace failed, surface estimation failed,
geometry tolerance exceeded, blend rejected by the output gate, provider ineligible. A node failure
fails the job visibly; interrupted running jobs fail on restart to avoid re-spending a charged call
(ADR-0007 queue semantics).

## Security and permissions

Handles the screened body photo for the blend node only, for the job's duration. Logs never contain
image bytes or signed URLs (SEC-INV-008). The blend node forwards a photo to `generation` only with
a valid `SafetyClearance` (SEC-INV-007).

## Observability

Per-node latency and failure counts, geometry-tolerance failure rate, blend latency, fallback
(geometric-only) rate.

## Performance / operational constraints

Asynchronous via `jobs`; the blend node is the most expensive step in the system (local depth plus a
hosted edit call). A per-job budget is set alongside the queue.

## Tests / verification

A parity suite asserts the node graph reproduces the pre-refactor studio outputs (TASK-0032/AC-002).
Node unit tests use injected fakes for each module. The geometry-tolerance and clearance tests live
with `mockup` and `generation` respectively; this module tests ordering and the fallback path.

## Known uncertainties and debt

- The numeric geometry tolerance and the blend provider are owed by TASK-0008; until then the graph
  runs the geometric-only fallback.
- LangGraph is a new worker dependency; its footprint and failure modes inside a `jobs` job are
  unmeasured.
- Whether every node should be independently retryable, or only the hosted-call nodes, is undecided.

## Alignment notes

New in TASK-0032; no implementation yet. Behaviour parity with `Studio.generate` is the bar for the
first (refactor) step before ADR-0016 behaviour is added.

## Change history

- 2026-09-26 (TASK-0008 preparation): `geometry_check` is a separate node after `ai_blend`, as the
  ordering contract above always stated; `BlendPort` only proposes (`blend_candidate`) and a
  `GeometryCheckPort` accepts. A candidate with no check fails closed. `master_artwork` passes the
  artwork operations a state view without the body photo or its clearance.
- 2026-09-26 (TASK-0032): Created. Status draft, no implementation.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Two-tier orchestration; creator pipeline is a LangGraph graph | INTENT | ADR-0015; TASK-0032 | NOT_RUN |
| No outbound egress from this module (ORCH-INV-001) | INTENT | TASK-0032/REQ-003 | NOT_RUN |
| Stencil derives from master, not the mockup (ORCH-INV-003) | INTENT | ADR-0003; TASK-0032/AC-007 | NOT_RUN |
| Blend guarded by geometry check (ORCH-INV-004) | INTENT | ADR-0016; TASK-0032/AC-005 | NOT_RUN |
