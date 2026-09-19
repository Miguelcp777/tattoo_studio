---
type: module-spec
module: flash
status: draft
source_paths:
  - services/worker/flash/*
last_reviewed: 2026-09-19
---

# Module: flash

## Responsibility

Turn a `TattooBrief` into the shaded reference render — the coloured or black-and-grey artwork a
user recognises as "the design", on a flat transparent or white background.

## Source ownership

`services/worker/flash/`

## Public interfaces

- `render_flash(brief, options) -> Design`
- `refine_flash(design, refinement, options) -> Design` (produces a new version, never mutates)

## Inputs and outputs

Input: a validated `TattooBrief`. Output: a `Design` with a high-resolution raster on a
transparent background, plus the prompt lineage that produced it.

## Domain invariants

- FLASH-INV-001: Output is flat artwork — no body, no skin, no scene, no background imagery.
- FLASH-INV-002: Refinement produces a new design version; prior versions remain retrievable
  (PROD constraint on iteration).
- FLASH-INV-003: The render honours the brief's aspect and composition intent so that the
  millimetre size in the brief stays meaningful.
- FLASH-INV-004: Prompt construction never includes a named living artist (PROD-INV-004).

## Data / persistence

Designs and their version lineage are persisted; raster bytes go to media storage by reference.

## Dependencies

`contracts`, `generation`, `media`, `safety`, `jobs`.

## External integrations

None directly; all model access is via `generation`.

## Error semantics

Typed errors for: brief incomplete, generation failed, output rejected by the safety gate.
A safety rejection is surfaced to the user as a rejection, never silently retried with a
softened prompt.

## Security and permissions

No user photographs are handled by this module. It must not declare a dependency that would give
it photo access (ARCH-INV-004).

## Observability

Generation attempts per accepted design, refinement depth, safety rejection rate.

## Performance / operational constraints

Asynchronous. Target is a single render within the queue's normal job budget; the exact budget is
set alongside the queue choice.

## Tests / verification

Prompt-construction tests are deterministic and run offline. Image-producing tests use recorded
fixtures. A visual review checklist covers style fidelity; it is human-run, not automated.

## Known uncertainties and debt

- Whether style fidelity from hosted models is sufficient without a LoRA is unproven and is the
  main quality risk of the project.
- Transparent-background support varies by provider; may require a matting step.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Flat artwork only | INTENT | User request 2026-09-19 | NOT_RUN |
| Style fidelity without LoRA | UNKNOWN | Untested | NOT_RUN |
