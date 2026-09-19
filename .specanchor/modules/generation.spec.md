---
type: module-spec
module: generation
status: draft
source_paths:
  - services/worker/generation/*
last_reviewed: 2026-09-19
---

# Module: generation

## Responsibility

The single outbound integration point for hosted image models. Presents one stable interface to
the engines and hides provider differences behind it.

## Source ownership

`services/worker/generation/`

## Public interfaces

- `GenerationProvider.text_to_image(prompt, params) -> ImageRef`
- `GenerationProvider.image_to_image(source, prompt, strength, params) -> ImageRef`
- `GenerationProvider.inpaint(source, mask, prompt, strength, params) -> ImageRef`
- A registry resolving a provider by configuration, not by caller choice.

## Inputs and outputs

Inputs: prompt, parameters, optional source and mask image references.
Outputs: an `ImageRef` (storage key plus metadata). Image bytes are never returned through the
queue (CODE-INV-003 companion, see coding standards).

## Domain invariants

- GEN-INV-001: No module other than this one calls an external image model (ARCH-INV-001).
- GEN-INV-002: Providers that do not offer a no-training / no-retention guarantee are ineligible
  (SEC-INV-001).
- GEN-INV-003: A photo-derived request is rejected unless the payload is marked as having passed
  the safety input gate (SEC-INV-007).
- GEN-INV-004: Provider responses are validated and normalized before leaving this module.

## Data / persistence

Writes generated images to media storage via `media`. Persists no domain state of its own beyond
request/response audit records.

## Dependencies

`contracts`, `media`, `safety`.

## External integrations

Hosted image-model APIs (candidates: fal.ai, Replicate, and direct provider endpoints). Exact
providers are selected in ADR-0001 and may change without a contract change — that is the point
of the adapter.

## Error semantics

Typed errors distinguishing: provider unavailable, rate-limited, content-policy rejection,
invalid parameters, and timeout. Retries apply only to transient classes, with backoff and a cap.
A content-policy rejection is never retried.

## Security and permissions

Provider credentials come from environment configuration. Requests and responses are logged
without image bytes and without signed URLs (SEC-INV-008).

## Observability

Per-provider latency, cost per call, error class counts, retry counts, and policy-rejection rate.

## Performance / operational constraints

Calls take seconds to minutes; all use is asynchronous via `jobs`. Per-user quotas are enforced
upstream in `jobs`, not here.

## Tests / verification

Contract tests against a recorded-fixture provider. Live-provider tests are marked and excluded
from the default run. A conformance suite every provider adapter must pass.

## Known uncertainties and debt

- Provider selection is not final.
- Cost ceilings and per-call budgets are undefined.
- Whether a fallback provider is attempted on failure is undecided.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Hosted APIs behind an adapter | INTENT | ADR-0001; user decision 2026-09-19 | NOT_RUN |
| Sole outbound integration point | INTENT | ARCH-INV-001 | NOT_RUN |
