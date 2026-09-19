---
type: global-spec
status: draft
last_reviewed: 2026-09-19
---

# Architecture

## Purpose

Define the durable structural contract of Tattoo Creator: how a tattoo idea becomes a
studio-grade stencil and an on-body mockup, and which boundaries may not be crossed.

## Current behavior with evidence status

Partially implemented. `contracts` (TASK-0002, TASK-0004), `generation` and `flash`
(TASK-0004) exist and are verified offline. `web` and `platform` have skeletons
(TASK-0001). The five other modules have no code, so statements about them are INTENT.

Note that `generation` and `flash` declare dependencies on `media`, `safety` and `jobs`,
none of which exist. Each consumer defines the narrow port it needs and the real module
implements it later, so the dependency direction in the diagram holds even though the
dependencies are not yet built.

## Intended behavior

The system is a three-stage pipeline over one shared contract:

```
User idea
   |
   v
[consultation]  --fills-->  TattooBrief (contracts)
   |
   +--> [flash]   --> shaded reference render
   |        |
   |        +--> [stencil] --> line-art pass -> vector trace -> 1:1 print asset
   |
   +--> [mockup]  --> depth -> geometric warp -> constrained AI blend -> on-body render
```

- `contracts` owns `TattooBrief` and every other cross-boundary schema. It depends on nothing.
- `consultation` produces a brief; it never generates imagery.
- `flash`, `stencil` and `mockup` consume a brief; they never converse with the user.
- `generation` is the only module permitted to call an external image model.
- `media`, `safety` and `jobs` are cross-cutting services consumed by the engines.
- `web` is a presentation and BFF layer; it holds no domain logic.

## Constraints

- Next.js (TypeScript) for `web` and `consultation`; Python (FastAPI) for the worker services.
- The two runtimes communicate only through the job queue and the shared contract schemas.
- No synchronous image generation on a request path. Every generation is a queued job.
- Exactly one outbound image-model integration point, in `generation`.

## Invariants

- ARCH-INV-001: Outbound model calls are confined to two modules and no others.
  `generation` owns image-model calls; `safety` owns moderation calls. Amended in
  TASK-0013: the original wording assumed image generation was the only outbound concern.
  Routing moderation through `generation` was considered and rejected, because it would
  make the gate's integrity depend on the availability and correctness of the module the
  gate exists to constrain — a bug or outage there could then disable moderation. A test
  enforces both halves and proves the allowlist is not vacuous.
- ARCH-INV-002: `contracts` has no dependency on any other module.
- ARCH-INV-006: The module dependency graph is acyclic. A cycle means some module can
  never be built first, and one survived four tasks unnoticed because neither of its
  members existed (FINDING-0003). A test parses the declared dependencies and fails on a
  cycle, and a second test fails when a module imports something its spec does not
  declare.
- ARCH-INV-003: A user-visible artifact is always traceable to the brief revision that produced it.
- ARCH-INV-004: No user photo is passed to any module that has not declared a media dependency.
- ARCH-INV-005: TypeScript and Python validate a shared payload against the same JSON Schema
  document. Neither hand-maintains a parallel definition, and neither substitutes a generated
  translation for the document when deciding validity. A shared fixture corpus proves the two
  reach identical verdicts.

## Conventions

- Module boundaries follow `.specanchor/module-map.json`. Adding a source tree requires adding it
  to the map in the same change, or the guard fails.
- Colocated tests: a module's tests live under that module's path and are owned by its spec.

## Non-goals

- Real-time or interactive generation.
- Client-side image generation.
- A plugin architecture for third-party engines.

## Evidence / sources

| Statement | Evidence status | Source / revision |
|---|---|---|
| ARCH-INV-001 egress confined to generation and safety | VERIFIED | Source-scan test; both allowlist entries proven non-vacuous |
| ARCH-INV-004 flash cannot reach photos | VERIFIED | Source-scan test |
| ARCH-INV-006 acyclic module graph | VERIFIED | Spec-parsing cycle test |
| ARCH-INV-005 holds for both schemas | VERIFIED | 52-case corpus across both runtimes |
| ARCH-INV-002: contracts depends on nothing | VERIFIED | Package manifests declare no internal deps |
| Three-stage pipeline decomposition | INTENT | User request, planning session 2026-09-19 |
| Hosted models behind an adapter | INTENT | ADR-0001; user decision 2026-09-19 |
| Hybrid mockup pipeline | INTENT | ADR-0002; user decision 2026-09-19 |
| Next.js + Python worker split | INTENT | ADR-0005; user decision 2026-09-19 |

## Unknowns

- Queue technology is not yet chosen (candidates: Redis/RQ, Celery, cloud-native queue).
- Persistence engine for briefs, designs and job records is not yet chosen.
- Deployment topology and region (relevant to GDPR data residency) is undecided.

## Change history

- 2026-09-19 (TASK-0013): ARCH-INV-001 amended to permit `safety` its own moderation
  egress, with the reasoning recorded above. Tightening rather than loosening: the
  invariant now names exactly two modules and the test enforces both.
- 2026-09-19: Created during SDD bootstrap. Status draft, no implementation.
- 2026-09-19 (TASK-0002): ARCH-INV-005 restated. It previously allowed validators to be
  *generated from* the schema; the refinement is that generated code may not be the authority,
  because a generated validator cannot express the schema's conditional rules and would silently
  accept payloads the schema rejects. The invariant now moves from INTENT to VERIFIED.
