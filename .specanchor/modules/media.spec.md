---
type: module-spec
module: media
status: draft
source_paths:
  - services/worker/media/*
last_reviewed: 2026-09-19
---

# Module: media

## Responsibility

Own the lifecycle of every binary asset: ingest, sanitize, store, serve and delete. It is the only
module that touches durable image storage.

## Source ownership

`services/worker/media/`

## Public interfaces

- `ingest_photo(upload, consent_ref) -> ImageRef` — strips EXIF, screens, then persists
- `store_artifact(bytes, kind, lineage) -> ImageRef`
- `resolve(image_ref) -> signed, expiring URL`
- `delete_cascade(image_ref) -> DeletionReceipt` — removes the asset and everything derived

## Inputs and outputs

Inputs: uploaded bytes and generated artifacts. Outputs: `ImageRef` handles. Raw bytes never
cross a module boundary; references do.

## Domain invariants

- MEDIA-INV-001: EXIF, including GPS and device identifiers, is stripped before durable
  persistence (SEC-INV-002).
- MEDIA-INV-002: Photos and derivatives are encrypted at rest (SEC-INV-003).
- MEDIA-INV-003: `ingest_photo` refuses to persist before the safety input gate has passed
  (SEC-INV-007).
- MEDIA-INV-004: Every asset records its derivation lineage, so `delete_cascade` can be complete
  (SEC-INV-004).
- MEDIA-INV-005: Served URLs are signed and expiring. Access is authorization-checked, never
  obscurity alone.
- MEDIA-INV-006: Stencils and flash, which contain no likeness, follow the design lifecycle;
  photos and mockups follow the photo lifecycle.

## Data / persistence

Object storage for bytes, plus a metadata record per asset carrying kind, lineage, retention class
and expiry. Retention sweeps run on a schedule and are idempotent.

## Dependencies

`contracts`, `safety`.

## External integrations

Object storage, undecided. Data residency is an open constraint tied to the deployment region.

## Error semantics

Typed errors for: upload too large, unsupported format, sanitization failed, storage unavailable,
deletion incomplete. An incomplete deletion is retried and alerted; it is never silently dropped.

## Security and permissions

The most privacy-critical module alongside `safety`. Logs never contain image bytes or signed
URLs (SEC-INV-008).

## Observability

Ingest and deletion counts, sanitization failures, retention sweep results, deletion latency
against the stated window, orphaned-asset count.

## Performance / operational constraints

Uploads should stream rather than buffer whole files in memory. Retention sweeps must not block
interactive paths.

## Tests / verification

EXIF stripping is verified by asserting absence of GPS and device tags on a corpus of real
camera-metadata fixtures. `delete_cascade` completeness is tested against a synthetic lineage
graph including multi-level derivations.

## Known uncertainties and debt

- Storage backend and region are undecided.
- Backup rotation period, which bounds SEC-INV-004, is undefined.
- Maximum upload size and accepted formats are undefined.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| EXIF stripped before persistence | INTENT | SEC-INV-002 | NOT_RUN |
| Cascade deletion by lineage | INTENT | SEC-INV-004 | NOT_RUN |
| Storage backend and residency | UNKNOWN | Undecided | NOT_RUN |
