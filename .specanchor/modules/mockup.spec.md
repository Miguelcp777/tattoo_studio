---
type: module-spec
module: mockup
status: draft
source_paths:
  - services/worker/mockup/*
last_reviewed: 2026-09-19
---

# Module: mockup

## Responsibility

Place an accepted design onto a body — a user photograph or an anatomical preset — so it reads as
ink under skin rather than a sticker. Also produces the healed and aged illustrations.

## Source ownership

`services/worker/mockup/`

## Public interfaces

- `estimate_surface(photo) -> SurfaceModel` (depth, normals, segmentation mask)
- `warp_design(design, surface, placement) -> WarpedDesign`
- `blend(warped, photo, options) -> Mockup` — constrained AI pass for skin integration
- `simulate_age(mockup, stage) -> Mockup` — stage is one of fresh, healed, aged

## Inputs and outputs

Input: an accepted `Design`, a `Placement`, and either a screened user photo or a preset.
Output: a `Mockup` naming the design version and placement it rendered.

## Domain invariants

- MOCKUP-INV-001: The geometric warp is authoritative for design shape. The AI blend pass is
  constrained to skin integration, lighting and texture; it may not alter design geometry
  (PROD-INV-001).
- MOCKUP-INV-002: Design geometry in the final mockup stays within the tolerance defined in
  ADR-0002 when measured against the pre-blend warp. Exceeding it fails the render.
- MOCKUP-INV-003: Placement respects the brief's millimetre size relative to the body part.
- MOCKUP-INV-004: Aging and healing outputs are labeled illustrative, never predictive
  (PROD-INV-003).
- MOCKUP-INV-005: A user photo reaches this module only after passing the safety input gate.

## Data / persistence

Mockups derived from a user photo share that photo's retention lifecycle and are deleted with it
(SEC-INV-004).

## Dependencies

`contracts`, `generation`, `media`, `safety`, `jobs`.

## External integrations

Depth and segmentation models (candidates: Depth Anything class, SAM class), run locally.
The blend pass goes through `generation`.

## Error semantics

Typed errors for: surface estimation failed, no suitable skin region found, placement outside the
detected region, geometry tolerance exceeded, blend rejected by the output safety gate.

## Security and permissions

This module handles sensitive personal data. Photo bytes are held only for the duration of the
job. Logs never contain image data or signed URLs (SEC-INV-008).

## Observability

Tolerance-failure rate, surface-estimation failure rate, blend latency, stage usage.

## Performance / operational constraints

The most expensive path in the system: local depth estimation plus a hosted blend call.
Asynchronous, with a job budget set alongside the queue choice.

## Tests / verification

Geometry-tolerance tests comparing pre- and post-blend landmarks on a fixed photo corpus.
Warp tests are deterministic and offline. The corpus uses consented or synthetic imagery only —
never retained user uploads.

## Known uncertainties and debt

- ADR-0002 is unvalidated. TASK-0008 is a spike that may overturn it in favour of geometric-only
  blending. This is the largest architectural risk in the project.
- The numeric geometry tolerance is not yet defined; TASK-0008 must define it.
- Aging simulation is a filter stack, not a physical model, and is understood as such.
- Hair, scars, existing tattoos and extreme poses are unhandled cases.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Hybrid warp-then-blend pipeline | INTENT | ADR-0002; user decision 2026-09-19 | NOT_RUN |
| AI blend preserves geometry within tolerance | UNKNOWN | Spike TASK-0008 pending | NOT_RUN |
| Aging is illustrative only | INTENT | Planning session 2026-09-19 | NOT_RUN |
