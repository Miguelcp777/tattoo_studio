---
type: module-spec
module: safety
status: draft
source_paths:
  - services/worker/safety/*
last_reviewed: 2026-09-19
---

# Module: safety

## Responsibility

Enforce the consent, moderation and content-policy gates defined in the quality-and-security
global spec. This module is the reason photo upload can be in v0 at all.

## Source ownership

`services/worker/safety/`

## Public interfaces

- `record_consent(user, consent_version) -> ConsentRecord`
- `revoke_consent(user) -> DeletionRequest`
- `screen_upload(image_ref) -> GateResult` — mandatory input gate
- `screen_output(image_ref) -> GateResult` — mandatory output gate
- `screen_brief(brief) -> GateResult` — text-level policy, including style mimicry
- `assert_age_affirmed(user) -> None`

## Inputs and outputs

Inputs: images, briefs, user identity. Outputs: a pass or reject result carrying a stable reason
code. Reasons are specific enough to act on and never echo the offending content.

## Domain invariants

- SAFETY-INV-001: Both gates are active wherever real user data is handled and cannot be disabled
  by configuration in production (SEC-INV-006).
- SAFETY-INV-002: No photo is persisted or sent to a provider before passing the input gate
  (SEC-INV-007).
- SAFETY-INV-003: Consent is recorded before the first upload, with timestamp and consent-text
  version, and is revocable.
- SAFETY-INV-004: Revocation triggers deletion of the photo and every derived artifact
  (SEC-INV-004).
- SAFETY-INV-005: Upload requires age affirmation (SEC-INV-005).
- SAFETY-INV-006: Briefs naming a living tattoo artist as a style target are rejected
  (PROD-INV-004).
- SAFETY-INV-007: A gate failure, including provider unavailability, denies. It never falls open.

## Data / persistence

Consent records persist independently of photos and outlive them, as the evidence that processing
was lawful. They contain no image data.

## Dependencies

`contracts`, `media`.

## External integrations

A content-moderation provider, undecided. Must support both image and text classification.

## Error semantics

Gate results are values, not exceptions. Provider failure raises, and the caller must treat it as
a denial (SAFETY-INV-007).

## Security and permissions

Handles the most sensitive flows in the system. Reason codes and logs never contain image bytes,
signed URLs, or consent identifiers (SEC-INV-008).

## Observability

Gate pass and reject rates by reason code, provider latency and failure rate, consent and
revocation counts, deletion completion times. Rejection spikes are an alerting signal.

## Performance / operational constraints

The input gate is on the critical path of every upload; it must be fast enough not to dominate
perceived upload time, while never being skipped.

## Tests / verification

Every SEC-INV in the global spec maps to at least one automated test here. Fail-closed behavior is
tested by simulating provider outage. Test corpora use synthetic or licensed imagery only.

## Known uncertainties and debt

- Moderation provider is unselected; accuracy on body imagery is unmeasured.
- False-positive handling, such as a legitimate torso photo rejected as explicit, has no appeal
  path designed.
- The living-artist blocklist has no agreed source or maintenance process.
- Age affirmation is self-declared and therefore weak.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Two mandatory gates | INTENT | ADR-0006; quality-and-security spec | NOT_RUN |
| Fail-closed gating | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Moderation accuracy on body imagery | UNKNOWN | Unmeasured | NOT_RUN |
