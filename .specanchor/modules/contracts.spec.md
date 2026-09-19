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

Schemas:
- `schemas/tattoo-brief.schema.json` — the brief. **Exists** (TASK-0002), version `1.0.0`.
  Placement and size are embedded rather than extracted, until a second consumer exists.
- `schemas/design.schema.json` — generated artwork and its lineage. **Exists**
  (TASK-0004), version `1.0.0`. Records the brief revision that produced it
  (CONTRACTS-INV-003) and carries raster pixels without ever carrying millimetres.
- `job.schema.json`, `consent.schema.json` — planned, not built.

TypeScript (`@tattoo/contracts`):
- `validateTattooBrief(payload)` — returns every issue rather than throwing.
- `assertTattooBrief(payload)` — validates or throws `TattooBriefValidationError`.
- `TattooBrief`, `StyleName`, `BodyPart` — generated types.

Python (`tattoo-contracts`):
- `validate_tattoo_brief(payload)`, `is_valid_tattoo_brief(payload)`,
  `assert_tattoo_brief(payload)`, `tattoo_brief_schema()`.

**Authority versus ergonomics.** The validating authority in both runtimes is the schema
document itself, run through `ajv` in TypeScript and `jsonschema` in Python. Generated
artifacts — TypeScript interfaces and pydantic models — are for editor support and FastAPI
and are never consulted for a verdict. They cannot express the schema's conditional colour
rules, so a generated validator would silently accept payloads the schema rejects.

## Inputs and outputs

Inputs: none at runtime. Outputs: a validation verdict in either runtime, plus generated
types for editor support. See the authority note above; `zod` was considered and rejected in
the ADR-0004 refinement.

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

- `TattooBrief` now has a real consumer: the flash engine reads every field it defines.
  That closed the "no consumer" gap but surfaced a new one — see FINDING-0002, where a
  brief can validate and still be unrenderable because dimension bounds say nothing about
  the ratio between them.
- `Design` has no consumer yet. Whether its fields are the right fields is untested until
  the stencil and mockup engines read it.
- The vocabulary lists (10 styles, 26 body parts) were assembled without a practising tattooer's
  review. They are plausible, not authoritative.
- Size bounds of 5mm to 600mm are a judgement call, not a measured constraint.
- `design`, `job` and `consent` schemas do not exist.
- Fixture parity is asserted on accept-or-reject, not on which rule fired. Two runtimes could in
  principle reject the same payload for different reasons without the corpus noticing.

Resolved in TASK-0002: the generation mechanism (`json-schema-to-typescript` and
`datamodel-code-generator`, both committed) and the field-level content of `TattooBrief`.

## Alignment notes

Aligned as of TASK-0002 for `TattooBrief`. The remaining schemas named under *Public interfaces*
are declared ahead of the code that will own them.

Two parity hazards were found while implementing and are handled in the schema rather than left
to chance. `format` is assertive only when a format checker is wired up, and the ecosystems wire
it differently, so patterns are used instead. Python's `re` matches Unicode digits with `\d`
while JavaScript's does not, so every pattern spells out `[0-9]` — otherwise a timestamp with
Arabic-Indic digits would validate in Python and fail in TypeScript.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0002): `TattooBrief` 1.0.0 defined; dual-runtime validation against the one
  schema document; 28-case shared corpus; generated artifacts committed with a reproducibility
  check.
- 2026-09-19 (TASK-0004): `Design` 1.0.0 added with a 24-case corpus. Validation generalised
  over a schema registry, so a new schema is covered by the corpus the moment it is
  registered. `py.typed` added — without it mypy treated this package as untyped in every
  consumer, silently disabling checking across the system's most important boundary.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Schema is valid JSON Schema 2020-12 | VERIFIED | Metaschema test | PASS |
| Both runtimes agree on all 28 fixtures | VERIFIED | 33 TS tests, 36 Python tests | PASS |
| Packaged schema copy is byte-identical | VERIFIED | Byte-comparison test | PASS |
| Codegen is reproducible | VERIFIED | Regenerate, then `git diff --quiet` exit 0 | PASS |
| Divergence is detected, not assumed | VERIFIED | Injected drift failed 2 tests | PASS |
| Design corpus agrees across runtimes | VERIFIED | 24 cases, both runtimes | PASS |
| Brief is the central contract | OBSERVED | Flash engine consumes every field | PASS |
| Brief dimension bounds imply renderability | **FALSE** | FINDING-0002 | FAIL |
| Design field set is the right field set | UNKNOWN | No consumer yet | NOT_RUN |
