## REQ-011 follow-up: colour generation (2026-09-20)

Implemented reference-conditioned flat colour/accent artwork, deterministic RGB contour
extraction and shared physical fit for the colour master and stencil. Mockup multiplies
the colour source onto skin without regenerating it. Source digest participates in the
shared identity. Output explicitly labels approximate contours for tattooer review.
This does not establish exact semantic contours, anatomical warp or expert cultural fidelity.

Verification: worker 267 tests passed; web 16 tests passed; TypeScript typecheck, worker
mypy (9 source files), targeted ESLint and Ruff passed. Tests exercise both colour modes
without palettes, actual reference bytes in provider requests, preservation of colour
pixels, exact mockup composition from those pixels, common identity and physical fit.
UI visibly shows the enabled "Generar diseño y plantilla" action with the user's accent
brief. Live paid colour output is NOT_VERIFIED. A local service restart interrupted the
web session; the web was restored in a managed terminal (3100), worker healthy on 8100.
Direct recovery/start-background operation was rejected by automatic approval review.
Original upload must be attached again through the UI. AC-008 remains open; all claims
of identical professional transfer or live colour quality remain NOT_VERIFIED.

## REQ-010 follow-up: optional client colours (2026-09-20)

Supersedes the earlier empty-accent-palette rejection in REQ-009. UI uses an optional plain-language colour preference, no HEX instructions. Both canonical schemas accept omitted palettes; legacy empty panel arrays normalize to omission. Extraction and brief readiness no longer require a palette. Explicit nonempty palette constraints remain unchanged.

Verified: pnpm test (126 passed), pnpm typecheck, targeted ESLint, Python contracts corpus (110 passed). Browser at 127.0.0.1:3100 saved the existing accent consultation at 200 x 300 mm with blank colours, zero questions, no validation error; only the missing Valencia CF reference remains pending. Rendered optional label and help text checked. No paid generation invoked. Code-to-Spec and Spec-to-Code for REQ-010: ALIGNED. Overall AC-008 remains PARTIAL: actual colour rendering and other original targets remain pending. Baseline coverage: no unmapped files.

# TASK-0019 verification and bidirectional review

## Screenshot follow-up — REQ-009/AC-009

The reported 200 x 300 mm size is valid. The previous generic error blamed dimensions
when the actual failing field was the empty accent palette. The route now maps canonical
schema issue paths to field-specific messages without loosening validation. Tests cover
empty palette with valid size, saving valid size+palette, and a genuinely invalid dimension.
Executed: web suite 13/13 PASS; workspace typecheck PASS; targeted ESLint PASS.
Both review directions ALIGNED for this isolated validation-message fix; broader AC-008 stays open.

Date: 2026-09-19. HEAD: `4c2535b9f9fcaeb7f2b84133735d0fce1817bd14` plus the working tree.
Authorization: user's “implementalo” and “continua”. No commit, deployment or external publication.
This task includes pre-existing uncommitted application work audited under TASK-0018; it does
not retroactively certify historical task claims.

## Executed checks

| Check | Result |
|---|---|
| `pnpm lint` (ESLint + Prettier) | PASS |
| `pnpm typecheck` | PASS, all three workspace packages |
| `pnpm test`, then consultation test after final missing-reference fix | PASS: contracts 98, consultation 12, web 10 (120 TS tests) |
| `pnpm build` | PASS, final source including missing-reference fix, Next production build and all seven pages/routes |
| worker: `python -m ruff check .`, `python -m mypy .`, `python -m pytest -q` | PASS: 263 tests, one upstream Starlette/AnyIO deprecation warning |
| contracts/python: same three commands | PASS: 110 tests |
| `git diff --check` | No whitespace errors; Windows CRLF normalization warnings only |
| Canonical schema copies | PASS in both contract corpora; generated-code regeneration checked separately in codegen-result.json |
| `python scripts/check-spec-sync.py --baseline` | PASS mapping coverage; see baseline-output.json |
| Full documentary guard | See guard-result.txt; AC-008 remains incomplete, so full task cannot pass closure |

493 test cases across runtimes includes shared contract cases intentionally executed in both.
These are not 493 independent end-to-end tests. No physical paper test has been performed.

## Acceptance trace

| Criterion | Evidence | Result |
|---|---|---|
| AC-001 honest failure | `test_missing_credentials_never_creates_fixture`, `test_provider_failure_never_returns_an_artifact`, `test_colour_does_not_silently_become_black_lineart`; result modal copy | PASS |
| AC-002 cumulative consultation | `agents.test.ts`: lion sequence, complete input, question cap and missing-symbol regression | PASS |
| AC-003 actual references | `test_reference_bytes_are_in_the_edit_request`; BFF success test asserts actual reference bytes/server brief; browser finds two independent Commons candidates; live provider run | PASS for candidate discovery and actual conditioning, not official-source certification |
| AC-004 common geometry | `test_native_master_is_shared_and_pdf_has_physical_size`, `test_ink_geometry_is_exactly_resized_master_without_generated_redraw`; common master/hash in real artifacts | PASS for planar contour proposal |
| AC-005 physical export | SVG dimensions, mirrored paths, PDF MediaBox/50 mm calibration/hash asserted; real SVG/PDF emitted | PASS for files; physical transfer NOT_VERIFIED |
| AC-006 boundary/queue | canonical studio-job and studio-status corpus; `test_owned_media_job_idempotency_lineage_and_deletion`, interrupted-job test, HTTP auth/contract test; BFF forged-brief test; expiry test | PASS for local single-worker scope |
| AC-007 checks and review | commands above, rendered observations below, both review directions below | PASS for scoped prototype verification |
| AC-008 original complete product | colour, realistic shading, anatomical surface integration, official reference verification and expert print acceptance | PARTIAL / NOT_VERIFIED; do not close TASK-0019 |

## Rendered/browser checks

Local browser at `http://127.0.0.1:3100/`:

- Submitted “Mare de Déu dels Desamparats y Senyera Valenciana, línea fina en el gemelo
  derecho, solo negro, 8 x 15 cm”. Observed 0/3 questions, fine line, right calf, black/grey,
  width 80 and height 150. Preserved when editing the topic.
- Observed statue candidate from the Valencia basilica and `Flag of the Valencian Community
  (2x3).svg`, visible source links and licence labels. Neither is labeled certified official.
- Resolved initial Next request-origin mismatch by comparing Origin to the actual Host header;
  the cross-origin rejection test remains passing.
- Resolved initial 410 px overflow at 390 px by using `minmax(0, 1fr)` and shrinking grid items.
  Final DOM observation: innerWidth=390, scrollWidth=384. Default viewport restored.
- Interface clearly labels black contours and pending colour/shading/curvature. Age/consent
  and reference review gate generation. No age affirmation was performed via browser tools.
- The full paid pipeline was exercised through the worker, not by clicking the final browser
  generation button. Modal/download UI has code/contract coverage but no full live browser
  download/print acceptance; do not describe that as tested.

## Live public-reference smoke

`live-smoke.py` performs a bounded real provider attempt with a public statue reference and
generated blank calf anatomy. No private or own-body photographs were used. Node/BFF fetch
works with Wikimedia; the Python HTTP client received a robot-policy 403, so the active BFF
downloads bounded allowlisted reference bytes and sends them through worker screening.
No alternative third-party host or redirect is allowed.

The first completed run accidentally used the narrow 60 x 20 mm fixture canvas; visual review
found unusably fragmented/small detail. `live-result-small-canvas.json` records that technical
success, not quality approval. Corrected graph tracing preserves short junction connections;
excessive discarded path length now fails rather than silently deleting detail.

A second, deliberate run used 80 x 150 mm and succeeded (`live-result.json`). Local artifacts:
`services/worker/.artifacts/live-smoke/{master.png,mockup.png,stencil.svg,pdf.pdf}`. The inspected
mockup shows the statue's detailed contours on generated skin; this is a contour visualization,
not the full realistic colour product. Each completed run made two image-generation calls
(master and blank anatomy), with no automatic retries. The sample's physical suitability and
exact cultural identity have not been approved by an expert.

## Code → Spec review: PARTIAL at full-product level

Active routes delegate consultation to the cumulative orchestrator and images to the Python
composition root. The only active image-model HTTP calls are in generation/studio.py. Worker
media is owner-scoped, encrypted, screened before persistence, and erased on session deletion
or expiry. The queue contains IDs and brief text, not images or credentials. Requests and job
results are validated against canonical shared schemas. The common native-lineart master is
the source for exports and the exact multiply input; the pixel test verifies compositing.

Documented intentional local decisions: anonymous ephemeral web sessions, SQLite single
worker, all studio assets expire after 24h, no automatic paid retry, own-body moderation
exception, open centerlines, and geometric-only preview. ADR-0007 records these choices.

Legacy fixture/provider modules remain isolated from the active app; their existence is not a
fallback. Removed the active fake-success path. Existing draft target sections describing
depth/AI blend or full shaded flash are not represented as completed implementation.

## Spec → Code review: PARTIAL

AC-001 through AC-007 have the scoped evidence above. The original target cannot be called
ALIGNED: there is no realistic colour/shading layer, surface reconstruction, automatic official
reference certification, professional stencil approval, or physical print validation. Regex slot
extraction also covers only a supported vocabulary. Geometry identity prevents independent
redraw drift but does not prove the generated statue itself is canonically exact.

Other production prerequisites remain outside this local remediation: durable web sessions,
multi-host job coordination, provider retention agreements, public account/rate controls,
deployment/residency and operational observability. No production-readiness assertion is made.

## Primary API references consulted

- https://developers.openai.com/api/docs/guides/image-generation
- https://www.mediawiki.org/wiki/API:Imageinfo

## Outcome

Local contour-prototype software checks PASS. Baseline mapping PASS. Full product alignment
and task closure remain PARTIAL. Keep TASK-0019 in_progress; the guard must not disguise the
unfinished AC-008 as passing acceptance.
