---
type: module-spec
module: contracts
status: draft
source_paths:
  - contracts/*
last_reviewed: 2026-09-19
---

# Module: contracts

## Responsibility

Own every schema that crosses a module boundary. `TattooBrief` is the system's central contract:
the consultation produces it, and all three engines consume it.

## Source ownership

`contracts/` — JSON Schema files, the shared fixture corpus, and generated type artifacts.

## Public interfaces

- `tattoo-brief.schema.json` — the brief.
- `design.schema.json` — a generated design and its version lineage.
- `placement.schema.json` — body location, size in mm, rotation, anchor point.
- `job.schema.json` — queued job envelope and lifecycle state.
- `consent.schema.json` — recorded consent, its version and timestamp.

## Inputs and outputs

Inputs: none at runtime. Outputs: validated types for TypeScript (`zod`) and Python (`pydantic`).

## Domain invariants

- CONTRACTS-INV-001: `TattooBrief` carries size in millimetres. Pixel dimensions are derived, never
  authoritative.
- CONTRACTS-INV-002: `style` is drawn from the closed curated vocabulary in the product-behavior
  spec; free text is not accepted in this field.
- CONTRACTS-INV-003: A `Design` records the brief revision that produced it.
- CONTRACTS-INV-004: Schema changes are additive, or carry an explicit version bump and migration.

## Data / persistence

None. This module defines shape, not storage.

## Dependencies

None (ARCH-INV-002).

## External integrations

None.

## Error semantics

Validation failures raise a typed error naming the schema, the failing path and the received type.

## Security and permissions

No secrets. Schemas must not require free-text fields that invite personal data where a
structured field would do.

## Observability

Validation failure counts by schema and field, to detect drift between the two runtimes.

## Performance / operational constraints

Validation is on every boundary crossing; it must stay negligible relative to a queued job.

## Tests / verification

One shared fixture corpus (valid and invalid cases) executed by both the TypeScript and the
Python validator. Divergence between them fails the build (ARCH-INV-005).

## Known uncertainties and debt

- Generation mechanism from JSON Schema to `zod` and `pydantic` is not yet chosen.
- Field-level content of `TattooBrief` is designed in TASK-0002, not here.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Brief is the central contract | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Dual validation from one schema | INTENT | ADR-0004 | NOT_RUN |
