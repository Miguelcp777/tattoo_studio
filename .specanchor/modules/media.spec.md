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

- `ingest_photo(upload, clearance) -> StoredAsset` — refuses without a `SafetyClearance`
  covering exactly these bytes, then sanitises, encrypts and persists. Takes the clearance
  rather than a consent reference because the clearance is what actually evidences the
  gate having passed (FINDING-0003).
- `store_artifact(bytes, kind, lineage) -> ImageRef`
- `read(asset_id) -> bytes` — decrypts. Signed expiring URLs (MEDIA-INV-005) await an
  HTTP surface and are not built.
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

- **The backend is a local filesystem**, which is a development implementation behind the
  port a cloud object store will implement. No durability guarantee, no replication, no
  residency control.
- **No key rotation.** The encryption key comes from settings; rotating it would make
  existing assets unreadable. A rotation strategy does not exist.
- **Retention sweeps are not scheduled.** `expired()` reports what is due; nothing runs it.
- Sanitisation re-encodes, which is lossy for JPEG. Acceptable for a photograph destined
  for stylisation, but it is a real trade rather than a free one.
- MEDIA-INV-005 (signed expiring URLs) is unimplemented; there is no HTTP surface yet.
- Storage backend and region are undecided.
- Backup rotation period, which bounds SEC-INV-004, is undefined.
- Maximum upload size and accepted formats are undefined.

## Alignment notes

Aligned as of TASK-0012 for ingest, storage, retrieval and deletion.

Sanitisation works by decode-and-re-encode rather than by removing an enumerated tag list,
so a metadata block nobody anticipated is dropped too.

One thing found while implementing and worth recording: **Pillow logs EXIF tag values at
DEBUG level**, including device make, model and the GPS pointer. An application running at
DEBUG would have the imaging library write to the log precisely the identifiers this module
strips from the file. Pillow's loggers are silenced around every decode, and a test asserts
those values do not reach captured logs (SEC-INV-008).

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0012): EXIF stripping, AES-GCM encryption at rest, lineage recording,
  cascade deletion and retention classes, over a local filesystem backend.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| EXIF stripped before persistence | VERIFIED | GPS and device tags absent after ingest | PASS |
| Bytes on disk are encrypted | VERIFIED | No image signature; wrong key cannot read | PASS |
| Nothing persists without a clearance | VERIFIED | Storage directory empty after refusal | PASS |
| A clearance cannot be replayed on other bytes | VERIFIED | Mismatched-digest test | PASS |
| Cascade deletion by lineage | VERIFIED | Three-level lineage, receipt asserted | PASS |
| Designs survive a photo cascade | VERIFIED | Retention-class test | PASS |
| Imaging library does not log EXIF | VERIFIED | Log capture after silencing PIL | PASS |
| Retention sweeps actually run | **NO** | Nothing schedules them | NOT_RUN |
| Storage backend and residency | UNKNOWN | Local filesystem only | NOT_RUN |

## TASK-0019 current implementation and remaining intent

The studio composition root consumes EncryptedFileStore with owner checks, moderated/EXIF-stripped uploads, ten input images per session, encrypted artifacts and explicit deletion. For this local session product every artifact uses 24-hour expiry and is deleted with its source/session. Expiry cleanup runs at worker startup and every ~60 seconds between jobs; no offline service runs after shutdown. This overrides indefinite design-history retention for the studio path only.

Evidence: `.specanchor/evidence/TASK-0019/verification.md`. Earlier VERIFIED rows are historical.
The overall realistic-colour/anatomical product target remains PARTIAL; draft module status is retained.
