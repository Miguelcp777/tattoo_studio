---
type: adr
status: proposed
id: ADR-0006
created: 2026-09-19
---

# ADR-0006: Privacy posture for body photographs

## Context

v0 accepts photographs of the user's own body so the mockup can be rendered on their actual skin.
This was a deliberate scope decision taken on 2026-09-19, with the consequences below stated
beforehand.

This is not ordinary user content. A photograph of an identifiable person's body is personal data,
and the body parts people tattoo include the torso, sternum, ribs, hips and thighs — so a
meaningful share of uploads will be partially undressed images of identifiable people. Some
proportion of uploads will also be of someone other than the uploader, including, without any
doubt, images uploaded to test what the system will accept.

The system additionally sends these images to third-party model providers for the blend pass,
which places them outside the project's own control.

> This ADR records engineering decisions derived from GDPR concepts. It is not legal advice and
> has not been reviewed by counsel. Legal review is a blocking prerequisite for public launch.

## Decision

Treat body photographs as the most sensitive asset in the system and build the controls before the
feature, not after.

**Consent.** Recorded before the first upload, specific to body-photo processing, stored with a
timestamp and the version of the consent text shown. Revocable, and revocation triggers deletion.
Consent records outlive the photos, as the evidence that processing was lawful.

**Ingest.** EXIF — including GPS coordinates and device identifiers — is stripped before the image
is written to durable storage. Photos are encrypted at rest and transmitted only over TLS.

**Gating.** Two mandatory gates: uploads are screened before any processing or persistence, and
generated output is screened before it is shown or stored. Neither can be disabled by
configuration in production. A gate failure, including provider unavailability, denies — it never
falls open.

**Provider eligibility.** No user photograph or derivative may be used to train or be retained by
a model provider. Providers without such a guarantee are ineligible, which constrains ADR-0001.

**Deletion.** Every asset records its derivation lineage, so deleting a photo deletes every
artifact derived from it. Stencils, which contain no likeness, follow the design lifecycle
instead. Deletion is reachable from the UI without contacting support.

**Age.** The service is not offered to users under 18; affirmation gates upload.

## Alternatives considered

- **Defer photo upload to v1 and ship with anatomical presets.** This was the recommendation
  during planning. Presets carry none of this risk and would have let the artwork pipeline mature
  first. The user chose the full slice; this ADR is the consequence of that choice, made explicit.
- **Self-host all models so photos never leave the system.** Removes the third-party exposure
  entirely. Rejected in ADR-0001 on infrastructure grounds. This remains the strongest available
  mitigation if provider guarantees prove inadequate.
- **Process photos in-memory only, never persisting them.** Attractive, and it would shrink the
  retention problem to nothing. Rejected because iteration and design history require the photo to
  outlive a single request. Worth revisiting: a session-scoped in-memory mode may be a viable
  privacy-preserving tier.

## Consequences

- `safety` and `media` become v0 modules with substantial test obligations rather than later
  hardening. Every SEC-INV maps to at least one automated test.
- Provider choice is constrained by data-handling terms, not only by output quality.
- Moderation false positives will reject legitimate uploads — a torso photo read as explicit. No
  appeal path is designed yet, and this will produce real user frustration.
- Retention windows, backup rotation and data residency must be decided before TASK-0007, and all
  three are currently undefined.
- Age affirmation is self-declared and therefore weak. It is a stated limitation, not a control.

## Affected specs/modules

`safety` (owner), `media`, `mockup`, `generation`, `web`, `quality-and-security`.

## Validation / revisit conditions

Validated in TASK-0007. Fail-closed gating is tested by simulating provider outage; cascade
deletion is tested against a multi-level synthetic lineage graph; EXIF stripping is tested against
real camera-metadata fixtures.

Blocking before public launch, and not satisfiable by engineering alone:

- Legal review of the consent text, lawful basis and retention periods.
- A decision on whether a DPIA is required. Assume yes until told otherwise.
- A decided deployment region, since residency follows from it.

Revisit the entire posture if no provider offers an adequate no-training guarantee, in which case
self-hosting the blend pass becomes a requirement rather than an option.
