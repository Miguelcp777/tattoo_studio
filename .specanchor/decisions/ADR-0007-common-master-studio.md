# ADR-0007 — Common line-art master and local queued studio

Status: accepted for implementation under TASK-0019 (user authorized audit remediation).

REQ-011 extension: for colour/accent briefs, the single flat colour artwork is the source.
Its RGB channel boundaries are traced locally into a review stencil using the same physical
fit as the colour preview. The source image digest participates in the shared design hash.
This derived contour proposal is approximate, not a claim of identical vector geometry or
professional transfer readiness. Native black line-art keeps the existing centerline path.
There is still no stencil extraction from a skin image or second generative stencil pass.

The flat native line-art pass is vectorized by centerline tracing and becomes the authoritative
design geometry. SVG and PDF export those same paths. Mockup composites a rasterization of
those same paths onto a photograph with a recorded geometric transform and multiplicative ink
blending. There is no generative pass after placement, and no stencil extraction from skin.
This refines ADR-0002/0003 rather than accepting the audited divergent implementation.
Open centerlines are valid (forcing every stroke closed would add lines). Tiny fragments are
filtered using a physical minimum; the preview is of the resulting master, not the pre-trace proposal.

Reference-conditioned image generation uses approved image bytes, not filenames. Commons search
returns candidates with source/licence metadata; it is not an authenticity certification.
The user reviews the output before download. Human approval does not become an automated guarantee.

SQLite queue is single-worker, durable, bounded, idempotent per owner+key. Interrupted running jobs
fail visibly on restart to avoid accidentally repeating a charged call. Artifacts use existing AES-GCM
storage. User photos are screened, EXIF-stripped and never sent to the image generator; moderation
is the necessary gate exception to external egress, followed by local-only placement.
Own-body uploads require explicit adult consent. Reference uploads still reject real people.
This updates the earlier pets/objects-only input-gate scope for the user's own-skin requirement.

Physical scale is guaranteed only for vector/PDF file dimensions. Photo scale requires explicit
calibration; anatomical preview without calibration is labeled illustrative. Real tattoo suitability
and cultural fidelity remain human review, not software assertions.
