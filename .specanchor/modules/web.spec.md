---
type: module-spec
module: web
status: draft
source_paths:
  - apps/web/*
last_reviewed: 2026-09-19
---

# Module: web

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

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| BFF with no domain logic | INTENT | ADR-0005 | NOT_RUN |
| Disclaimers required on artifacts | INTENT | PROD-INV-003, PROD-INV-005 | NOT_RUN |
| Authentication approach | UNKNOWN | Undecided | NOT_RUN |
