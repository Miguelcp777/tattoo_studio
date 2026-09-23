---
type: module-spec
module: generation
status: draft
source_paths:
  - services/worker/generation/*
last_reviewed: 2026-09-19
---

# Module: generation

TASK-0028 (ADR-0012): `generation/style_library.py` builds the catalogue images. It lives here
because ARCH-INV-001 confines outbound model calls to this module and `safety`; the provider is
injected rather than constructed, since `generation` may not import `app` without closing a
cycle. Failures are collected rather than raised on the first, and generation is resumable, so a
provider refusal partway through does not re-spend on what already succeeded.

TASK-0025 (ADR-0009): `generation/bfl_studio.py` (`BflStudioProvider`) renders the blank
skin background on BFL FLUX.2 (`flux-2-pro`, EU cluster default), selected by configuration.
Artwork, edits, reference analysis and output moderation stay on OpenAI and are inherited
unchanged, so `image_model` remains an OpenAI model name. FLUX.2 is not eligible for artwork:
asked for a flat master on white it returns a photograph of the tattoo already applied to a
limb, and holds that against explicit instruction. The pipeline reads any non-white pixel as
ink, so such a master corrupts the visible-ink crop, the zone sizing and the stencil trace.
Prompts are shared static helpers on `StudioProvider`, unchanged for either vendor. No body
photograph is an input (ADR-0007): the background call is text-only and only runs when the
client supplied no photograph.

TASK-0021: edit_artwork sends the selected flat master FIRST and original reference images
to one image-edit request. The request asks to preserve unrequested details; no pixel-perfect
preservation claim. User changes may override the original artistic treatment (including color),
recorded in edit provenance; physical dimensions/placement remain from the parent brief.
Body photographs and generated skin backgrounds are never edit inputs.

TASK-0020/REQ-004: realistic monochrome briefs use a rendered/shaded master, then enforce
grayscale locally. Style requests no longer silently become native contour-only output.
Background prompt requests photographic pores, light and body volume for local composition.

TASK-0019/REQ-011: colour/accent briefs generate one flat colour artwork conditioned on
actual reference bytes. Absent palettes use the references and subject; no extra client question.
Native black line-art retains its existing path. Provider errors remain explicit, no retry/fallback.

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
- 2026-09-22 (TASK-0025): FLUX.2 background backend (ADR-0009), shared prompt helpers,
  13 adapter tests + 3 settings tests. Artwork deliberately left on OpenAI.
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
| FLUX.2 adapter request/poll/error handling (TASK-0025) | VERIFIED | `test_bfl_studio_provider.py`, scripted transport | PASS |
| FLUX.2 background path behaves as documented live | VERIFIED | Live call 2026-09-22, 23.3s, 1024x1536, 87% skin pixels | PASS |
| FLUX.2 returns flat artwork on white | VERIFIED | Two live calls; both returned a tattooed limb. Rejected for artwork (ADR-0009) | FAIL |
| Artwork and edits never reach FLUX.2 | VERIFIED | `test_artwork_and_edits_never_reach_flux`, `test_openai_image_model_is_not_overwritten_by_the_flux_model` | PASS |
| BFL no-training / retention terms | UNKNOWN | Not stated in docs read 2026-09-22 | NOT_RUN |

## TASK-0019 current implementation and remaining intent

generation/studio.py is the active paid-image adapter. It analyzes actual screened reference bytes, passes them in multipart image edits, requests native line art and a separate blank skin photograph. No user body photograph is sent to image generation. Missing credentials/errors cannot become placeholder success. Image/vision models are configurable; live smoke evidence uses public reference data.

Evidence: `.specanchor/evidence/TASK-0019/verification.md`. Earlier VERIFIED rows are historical.
The overall realistic-colour/anatomical product target remains PARTIAL; draft module status is retained.
