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

- **The fal adapter has never made a real call.** Request construction and response
  parsing follow fal's documentation, confirmed 2026-09-19, and every branch is tested
  against a scripted transport. Whether fal behaves as documented is unverified, and no
  offline test can establish it.
- Whether the provider returns usable tattoo artwork is a separate and larger unknown.
- The synchronous endpoint is used rather than fal's queue. The queue gives progress and
  cancellation, which the product wants, but asynchrony belongs to `jobs` (TASK-0006);
  two competing notions of a pending job would be worse than none.
- Cost ceilings and per-call budgets are undefined.
- Whether a fallback provider is attempted on failure is undecided.
- GEN-INV-002 is **unverified**: no provider's no-training terms have been read. fal was
  selected on capability, not on its data-handling guarantees.
- Image-conditioned methods are declared but unimplemented by every adapter, because the
  clearance they require cannot be constructed.

## Alignment notes

Aligned as of TASK-0004 for the text-to-image path.

The invariants live in the provider base class rather than in each adapter, so an
adapter inherits the clearance check, the retry policy and result normalization and
implements only request construction and response parsing. A conformance suite runs
against every adapter in the repository, which is what makes ADR-0001's claim of
reversible provider choice concrete rather than aspirational.

`SafetyClearance` is uninstantiable. Image-conditioned generation requires one, so that
path is unreachable rather than guarded by a runtime branch a refactor could delete.

The production HTTP client lives in `http.py` and nowhere else, which is what lets the
architectural test assert outbound capability is confined to this module without the
assertion being vacuous.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0012): `SafetyClearance` relocated to the `safety` module, which now
  exists and is its proper owner (FINDING-0003). Re-exported here so call sites are
  unchanged. No behaviour change.
- 2026-09-19 (TASK-0004): Provider protocol, typed errors, retry policy, registry,
  deterministic fixture provider, fal adapter and conformance suite. 52 tests.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Conformance suite passes for every adapter | VERIFIED | 20 conformance tests, 2 adapters | PASS |
| Sole outbound integration point | VERIFIED | Source-scan architectural test | PASS |
| Photo path is unreachable without clearance | VERIFIED | Recording transport, zero requests | PASS |
| Transient retried, policy rejection not | VERIFIED | Call-count assertions | PASS |
| Malformed responses raise | VERIFIED | 7 malformed-payload tests | PASS |
| Credentials absent from logs and errors | VERIFIED | Log-capture and message assertions | PASS |
| fal behaves as documented | UNKNOWN | Never called; no credential | NOT_RUN |
| Provider no-training terms satisfy SEC-INV-001 | UNKNOWN | Terms not read | NOT_RUN |
