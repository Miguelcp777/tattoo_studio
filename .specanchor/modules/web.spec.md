---
type: module-spec
module: web
status: draft
source_paths:
  - apps/web/*
last_reviewed: 2026-09-19
---

# Module: web

TASK-0026 (ADR-0010): a persistent progress rail names the five steps and marks each completed,
current or pending, with optional steps labelled. It is derived from the session the page already
holds and gates nothing (WEB-INV-001); its conditions read the same values the panel gates on, so
it cannot report readiness the panel would refuse. The millimetre fields are labelled optional and
show the proposed size as placeholder. Above 1024px the preferences panel is sticky with its own
scroll, so it cannot outgrow the viewport and the primary action stays reachable. The background is
authored in CSS with an inline SVG grain rather than a shipped image asset.

TASK-0024 (ADR-0008): the coverage controls no longer describe themselves as uniformly visual.
Smaller/larger remain view-only; "Ocupar toda la zona" states that it changes the print
millimetres and that the figure comes from reference adult anatomy to be confirmed with a
tattooer. The displayed sheet size follows the returned brief, so it changes on a zone revision
and not on a nudge. No business rule moved here (WEB-INV-001).

TASK-0023: print preview labels refer to sheet format and disclose possible white margins
when the mockup used a source crop. On reload restore the latest successful history result
unless the current job is still active, avoiding stale-result display after correction.

TASK-0022: preview offers smaller/larger/fill-zone controls explicitly labeled as visual
coverage, leaving PDF millimetres unchanged. Initial submission omits untouched placement
for generated anatomy; touching sliders or adding a body photo retains manual placement.

TASK-0021: the preview accepts a bounded natural-language change request and an explicit
create-version action, preserving prior results on failure. The session's latest 20 successful
jobs can be reopened/branched while retained. BFF forwards only parent job ID, request and
idempotency key for edits; worker resolves owned source data. Adult/processing consent remains
required. Existing progress and zoom apply to revisions.

TASK-0020/REQ-001..003: official crest is fetched only at the exact allowlisted HTTPS path,
bounded and rasterized locally before worker moderation. Reject embedded external SVG resources.
Missing-reference retry is explicit. Submission and queued/running jobs show indeterminate
progress, phase and elapsed time. Both output previews offer keyboard-accessible 100..400%
detail views with pan/scroll/reset. No invented completion percentage.

TASK-0019/REQ-011: submit colour/accent briefs without the obsolete colour rejection.
The action reads "Generar diseño y plantilla". Surface the worker's approximation notice.

TASK-0019/REQ-009: preference errors identify the schema field that failed. A palette
failure must not be presented as a size error; 200 x 300 mm is valid. Explicit invalid values still fail; optional colours follow REQ-010.

## Responsibility

Presentation and backend-for-frontend. Renders the consultation, the design gallery, the placement
editor and the handoff sheet, and brokers requests to the worker. It holds no domain logic.

## Source ownership

`apps/web/`

## Public interfaces

HTTP routes consumed by the browser:
- consultation turn exchange
- design listing and version history
- upload initiation and consent capture
- placement editing (position, rotation, scale in mm)
- job submission and status polling
- handoff sheet download

## Inputs and outputs

Inputs: user interaction and uploads. Outputs: rendered UI and job references. Long operations
return a `JobRef` immediately; the UI polls or subscribes for completion.

## Domain invariants

- WEB-INV-001: No business rule lives here. Anything that needs testing without a browser belongs
  in another module.
- WEB-INV-002: Every request crossing into the worker is validated against its contract schema at
  the boundary (CODE-INV-001).
- WEB-INV-003: The UI never presents a generated artifact without the visualization disclaimer
  (PROD-INV-005), and never presents aged output as a prediction (PROD-INV-003).
- WEB-INV-004: Consent and age affirmation are collected before any upload control is enabled
  (SEC-INV-005, SAFETY-INV-003).
- WEB-INV-005: A user can reach deletion of their photos and derived artifacts from the UI without
  contacting support.

## Data / persistence

Session and auth state only. No domain persistence.

## Dependencies

`contracts`, `consultation`, and the worker via HTTP and job references.

## External integrations

None directly.

## Error semantics

Job failures render as the typed failure reason from `jobs`, in user-facing language. Provider
internals are never surfaced.

## Security and permissions

Enforces authentication and authorization on every route. Signed media URLs are requested per
view and never embedded in cacheable markup.

## Observability

Route latency and error rates, consultation abandonment, upload funnel completion, deletion
request counts, handoff sheet download counts. The last is the product's key success metric.

## Performance / operational constraints

The placement editor must stay responsive while manipulating high-resolution assets; it works on
downscaled proxies and applies the transform at full resolution server-side.

## Tests / verification

Component and route tests. End-to-end tests over the critical paths: idea to handoff sheet, and
upload to deletion. Accessibility checks to WCAG 2.1 AA on the primary flows.

## Known uncertainties and debt

- Authentication approach is undecided.
- Whether job completion uses polling or server-sent events is undecided.
- The placement editor interaction model is undesigned.
- The shell has no styling, no layout system and no accessibility work. The WCAG 2.1 AA
  commitment under *Tests / verification* is unaddressed and currently unmeasured.
- `vitest` runs in a `node` environment. Component rendering tests will need a DOM environment,
  which is added by the first task that renders something worth asserting on.

## Alignment notes

Partially aligned as of TASK-0014. The consultation turn exchange and real-time brief tracking
surface are implemented in `apps/web` via the Next.js BFF route `/api/consultation`, backed by
`@tattoo/consultation`. Image references are supported. Design gallery, placement editor and
handoff sheet remain planned for future tasks.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0001): Next.js shell added, building under TypeScript strict mode. Disclaimer
  copy established with tests.
- 2026-09-19 (TASK-0014): Added consultation turn exchange BFF route, reference image upload,
  and real-time brief tracker UI.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| BFF with no domain logic | OBSERVED | Delegated to @tattoo/consultation | PASS |
| App builds under strict TypeScript | VERIFIED | `pnpm --filter web build`, `tsc --noEmit` exit 0 | PASS |
| Disclaimer copy exists and is non-empty | VERIFIED | `src/content/disclaimers.test.ts`, 4 tests | PASS |
| Consultation turn exchange route | VERIFIED | `src/app/api/consultation/route.test.ts` | PASS |
| Disclaimer shown on every artifact | INTENT | WEB-INV-003; no artifacts exist yet | NOT_RUN |
| Authentication approach | UNKNOWN | Undecided | NOT_RUN |

## TASK-0019 current implementation and remaining intent

The active page uses server-owned HttpOnly sessions, bounded input, same-origin checks and worker service authentication. Generation submits server brief revisions and owned references; uploads, job polling, restored current job, geometric placement, explicit mm, review-gated downloads and deletion are wired. Black contour limitations are visible; unsupported colour fails before generation. Desktop rendered checks and 390px overflow check are in TASK-0019 evidence.

Evidence: `.specanchor/evidence/TASK-0019/verification.md`. Earlier VERIFIED rows are historical.
The overall realistic-colour/anatomical product target remains PARTIAL; draft module status is retained.

TASK-0019/REQ-010: Palette is optional for colour and accents. Missing palette delegates selection to the design process using the idea and reviewed references; it is not a missing client answer. Empty panel input is omitted. Explicit palettes remain bounded and validated. Colour rendering remains pending.
