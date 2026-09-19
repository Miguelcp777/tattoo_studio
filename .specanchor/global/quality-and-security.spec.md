---
type: global-spec
status: draft
last_reviewed: 2026-09-19
---

# Quality and Security

## Purpose

Define the privacy, safety and quality contract. v0 accepts user photographs of their own body,
so this specification governs sensitive personal data from the first commit.

> This document states engineering requirements derived from GDPR concepts. It is not legal
> advice and has not been reviewed by counsel. Legal review is an open item (see Unknowns) and
> must precede any public launch.

## Current behavior with evidence status

No implementation exists. All statements are INTENT.

## Intended behavior

### Personal data handled

| Data | Sensitivity | Retention intent |
|---|---|---|
| Uploaded body photograph | High — image of an identifiable person, possibly intimate | Shortest period that supports the session; hard-deleted on request and on expiry |
| Generated mockup derived from that photo | High — derived from the above | Same lifecycle as its source photo |
| TattooBrief text | Low to moderate — may include personal meaning | Retained with the user's design history |
| Generated flash and stencil | Low — no personal likeness | Retained with the user's design history |

Photos and mockups are deleted together. Deleting a photo must delete every artifact derived
from it; a stencil, which contains no likeness, survives independently.

### Consent

Consent is collected before the first upload, is specific to body-photo processing, is recorded
with timestamp and version of the consent text, and is revocable. Revocation triggers deletion.

### Moderation

Two gates, both mandatory:
- **Input gate:** uploaded photos are screened before any processing or persistence.
- **Output gate:** generated imagery is screened before it is shown or stored.

## Constraints

- Photos are encrypted at rest and transmitted only over TLS.
- EXIF metadata — including GPS coordinates and device identifiers — is stripped on ingest,
  before the image is written to durable storage.
- Storage keys for photos are unguessable and access is authorization-checked, never
  security-by-obscurity alone.
- Secrets live in environment configuration, never in the repository. Spec and evidence files
  record paths, never secret values.

## Invariants

- SEC-INV-001: No user photograph or derivative is used to train, fine-tune, or is retained by
  any model provider. Provider configuration must explicitly opt out where such a setting exists,
  and providers without such a guarantee are not eligible.
- SEC-INV-002: EXIF is stripped before durable persistence.
- SEC-INV-003: Photos and their derivatives are encrypted at rest.
- SEC-INV-004: A deletion request removes the photo and every derived artifact within the stated
  window, including from backups within the backup rotation period.
- SEC-INV-005: The service is not offered to users under 18. Age affirmation gates upload.
- SEC-INV-006: Both the input and output moderation gates are active in every environment that
  handles real user data. Neither may be disabled by configuration in production.
- SEC-INV-007: No photo is sent to an external provider before passing the input gate.
- SEC-INV-008: Logs and error reports never contain image bytes, signed media URLs, or consent
  identifiers.

## Conventions

- Security-relevant behavior is tested, not merely documented. Each SEC-INV above requires at
  least one automated test before the module owning it can reach `verified`.
- Dependency and secret scanning run in CI.

## Non-goals

- Formal certification (ISO 27001, SOC 2) in v0.
- Self-hosting models to avoid provider data exposure — mitigated by SEC-INV-001 instead.

## Evidence / sources

| Statement | Evidence status | Source / revision |
|---|---|---|
| Photo upload included in v0 | INTENT | User decision 2026-09-19 |
| Privacy posture (consent, retention, no-training) | INTENT | ADR-0006 |
| Moderation on input and output | INTENT | Planning session 2026-09-19 |
| GDPR applicability and specific obligations | UNKNOWN | Requires legal review |

## Unknowns

- Legal review of the consent text, retention periods and lawful basis has not occurred.
- Concrete retention window (hours vs days) is undecided and must be set before TASK-0007.
- Data residency requirements depend on the undecided deployment region.
- Whether a DPIA is required. Given systematic processing of body imagery, assume yes until
  legal review says otherwise.
- Age affirmation is self-declared; stronger verification is unassessed.

## Change history

- 2026-09-19: Created during SDD bootstrap. Status draft, no implementation.
