---
type: adr
status: proposed
id: ADR-0004
created: 2026-09-19
---

# ADR-0004: One JSON Schema as the source of truth for both runtimes

## Context

The system runs TypeScript (web, consultation) and Python (worker) and passes structured data
between them — most importantly the `TattooBrief`, which the consultation produces and all three
engines consume.

Two independently maintained type definitions for the same payload drift. The drift is silent:
the producer adds a field the consumer ignores, an optional becomes required on one side only, an
enum gains a value the other side rejects. It surfaces in production as a validation error on a
path nobody tested.

The brief is the contract the whole system turns on. If it drifts, everything downstream is
generating from a payload it half-understands.

## Decision

Author each cross-boundary schema once as JSON Schema under `contracts/`. Derive both runtime
validators from it: `zod` for TypeScript, `pydantic` v2 for Python. Neither is hand-maintained.

Maintain one shared fixture corpus — valid and invalid payloads — under `contracts/`, executed by
both runtimes' test suites. A schema change that breaks one runtime fails a test rather than
reaching production (ARCH-INV-005).

`TattooBrief` carries size in millimetres as the authoritative dimension. Pixel dimensions are
derived at render time and are never the source of truth, so that a design's physical size means
the same thing to the consultation, the stencil exporter and the mockup placer.

## Alternatives considered

- **Hand-written types on both sides, kept in sync by review.** Rejected: relies on discipline to
  catch a class of error that is invisible on inspection.
- **Protobuf or Avro as the schema language.** Stronger codegen story. Rejected as heavier than
  needed, and JSON Schema keeps the payloads directly readable in logs and fixtures, which matters
  while the brief's shape is still being designed.
- **OpenAPI as the single source.** Reasonable for the HTTP boundary, but the brief also crosses
  the queue boundary, where OpenAPI has nothing to say.
- **A shared runtime (all Python or all TypeScript).** Rejected in ADR-0005; the imaging ecosystem
  is Python's and the UI ecosystem is TypeScript's.

## Consequences

- A code-generation step enters the build, and generated artifacts must be either committed or
  produced reliably in CI. Which of the two is not yet decided.
- Schema changes become deliberate: they touch `contracts`, which is a contract change requiring
  a spec update under the Spec Anchor protocol.
- The generation toolchain from JSON Schema to `zod` and to `pydantic` is not yet selected, and
  the available tools differ in quality. This is the main execution risk of the decision.

## Affected specs/modules

`contracts` (owner), `consultation`, `web`, and every worker engine; `architecture`,
`coding-standards`.

## Validation / revisit conditions

Validated in TASK-0002, which must show a schema change propagating to both runtimes and a
deliberately introduced divergence failing a test.

Revisit if the generation toolchain proves unreliable for either target — in which case the
fallback is a schema-conformance test suite over hand-written types, which preserves the guarantee
while giving up the convenience.
