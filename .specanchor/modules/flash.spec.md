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

- **Style fidelity remains completely unproven.** No image has been generated. The tests
  show a prompt is well-formed; they say nothing about the artwork. This is still the
  main quality risk of the project and TASK-0004 did not reduce it.
- FLASH-INV-004 is only **partially** enforced. Prompt construction strips the
  grammatical constructions that request mimicry ("in the style of", "inspired by"), but
  it does not recognise artist *names*: a brief reading "Horiyoshi dragon" passes
  through. Name blocking belongs to `safety` (SAFETY-INV-006) and does not exist. A test
  documents this gap rather than leaving it implicit.
- Output is currently prompted onto a plain white background, not transparency. Producing
  a genuine alpha channel varies by provider and may need a matting step.
- Briefs with an aspect ratio beyond 1:8 are refused as unrenderable, yet the contract
  accepts them. See FINDING-0002.
- The 1:8 limit and the 1024px long edge are judgement calls, not measured figures.
- `DesignStore` is a port with no production implementation.

## Alignment notes

Aligned as of TASK-0004 for the render path.

Prompt construction is a pure function, which is what makes the adversarial testing of
FLASH-INV-004 cheap — ten mimicry phrasings across three free-text fields, all offline.

Every closed vocabulary the contract defines has a corresponding prompt phrase, asserted
by a test that reads the schema. A style the contract accepts but the prompt cannot
express would otherwise fail only at runtime.

The engine validates its own output against the Design contract before returning. An
engine that emits an invalid Design is worse than one that refuses, because the damage
surfaces somewhere else entirely.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0004): Prompt construction, render and refine with version lineage.
  88 tests. Style fidelity still unproven.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Prompts demand flat artwork | VERIFIED | Flatness clause and negative prompt tests | PASS |
| Aspect follows the brief's millimetres | VERIFIED | Ratio tests on plan and artifact | PASS |
| Refinement never mutates the prior version | VERIFIED | Immutability and lineage tests | PASS |
| Engine output satisfies the Design contract | VERIFIED | Contract validation in the engine | PASS |
| Mimicry constructions are stripped | VERIFIED | 10 adversarial phrasings, 3 fields | PASS |
| Artist *names* are blocked | UNKNOWN | Needs the safety blocklist; gap is tested | NOT_RUN |
| Output artwork is any good | UNKNOWN | Never generated | NOT_RUN |
| Style fidelity without LoRA | UNKNOWN | Untested | NOT_RUN |
