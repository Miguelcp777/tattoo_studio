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
- `screen_upload(bytes) -> GateResult` — mandatory input gate, over bytes rather than a
  stored reference, because nothing is stored until it passes
- `screen_output(bytes) -> GateResult` — mandatory output gate (not yet built)
- `screen_brief(brief) -> GateResult` — text-level policy, including style mimicry
- `assert_age_affirmed(user) -> None` (not yet built)
- `mint_clearance(bytes, ...) -> SafetyClearance` — internal; the only way a clearance
  comes into existence

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

`contracts`.

**Not `media`.** The gate screens *bytes*, before anything is stored and before anything
reaches a provider (SEC-INV-007), so at the moment it runs there is nothing in `media` to
look at. The earlier declaration was both circular and contradicted the invariant it
existed to serve; see FINDING-0003.

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

- **The gate currently passes nothing.** There is no moderation provider, so every input
  is denied with `no_moderation_provider`. That is deliberate (TASK-0012/DEC-003): a gate
  that cannot pass is useless but safe, while one that passes without checking is neither.
  TASK-0013 supplies the provider.
- Consent records, age verification and the third-party-photograph question are not built.
  The agreed scope is pets and objects, where a user consents only for themselves.
- `screen_output` and `screen_brief` are specified but not implemented.
- Moderation provider is unselected; accuracy on body imagery is unmeasured.
- False-positive handling, such as a legitimate torso photo rejected as explicit, has no appeal
  path designed.
- The living-artist blocklist has no agreed source or maintenance process.
- Age affirmation is self-declared and therefore weak.

## Alignment notes

Partially aligned as of TASK-0012: the gate structure, the clearance type and
deny-by-default behaviour exist. Moderation itself does not.

`SafetyClearance` lives here, and this is the only module that may mint one. It sat in
`generation` during TASK-0004 purely because this module did not exist.

A clearance is bound to a SHA-256 digest of the exact bytes screened. A token meaning
merely "something passed" would let a caller screen a harmless image and then ingest a
different one, satisfying the type system while defeating SEC-INV-007 completely.

Forgery is blocked by a context flag set only inside `mint_clearance`, not by a field on
the dataclass. The field approach was tried first and was wrong: `dataclasses.replace`
copies fields, so a valid clearance could be cloned onto different bytes. A test covers
that specific attack.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0012): Gate structure, clearance type and deny-by-default
  implementation. Dependency on `media` removed, resolving FINDING-0003.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Gate denies without a provider | VERIFIED | 16 gate tests | PASS |
| Gate denies when a provider raises | VERIFIED | Exploding-provider test | PASS |
| No rejection ever carries a clearance | VERIFIED | Parametrised over every reject path | PASS |
| Clearance is bound to the screened bytes | VERIFIED | Digest-binding tests | PASS |
| Clearance cannot be forged or retargeted | VERIFIED | Direct construction and `replace` | PASS |
| Input gate actually moderates | **NO** | No provider exists; everything is denied | NOT_RUN |
| Output gate exists | **NO** | Not built | NOT_RUN |
| Moderation accuracy on body imagery | UNKNOWN | Unmeasured | NOT_RUN |
