# TASK-0022 verification — 2026-09-20

Root causes verified in code: default 36% image-width placement ignored absolute millimetres;
image iterations inherited placement and unnecessarily redrew/retraced pure coverage requests.
User's screenshot also showed a complex-stencil rejection. No claim that all complex
artwork can now be traced; pure placement bypasses that operation entirely.

## Acceptance evidence

- AC-001: generated calf without manual placement uses dimension-responsive illustrative
  placement with safe bounds. Unit test proves larger millimetre brief gives larger preview.
  Manual/calibrated placement remains authoritative. UI explains automatic/manual modes.
- AC-002: the exact user's Spanish phrase plus the shorter full-calf phrase complete through
  HTTP/queue/storage without any artwork edit call. Explicit controls are rendered in the
  user's existing proposal. Mixed artwork/coverage requests retain artwork generation.
- AC-003: exact asset IDs and design identity for master, stencil, mirrored stencil, PDF,
  mirrored PDF and background remain unchanged in coverage revisions. Calibrated photos
  explicitly reject visual-only coverage. Physical PDF size is not inferred or changed.
- AC-004: live public-QA recomposition succeeded in about four seconds: 471x706 px became
  840x1260 px on the SAME saved background, retaining 200x300 mm print dimensions. Recorded
  in live-result.json; visually inspected .artifacts/qa-task0022/after.png. No paid image call
  needed for that revision, no user's proposal or consent checkbox changed.

## Checks

- Full worker pytest: 275 passed (one upstream Starlette deprecation warning).
- Worker scoped ruff passed; mypy app passed for 9 files.
- TypeScript: contracts 101, consultation 17, web 18 tests passed; typecheck and scoped ESLint passed.
- Python contracts: 113 passed after regenerated coverage/mode contract types.
- Rendered UI verified on existing user's proposal: three coverage buttons and explicit
  unchanged-PDF text. Left modal open; age/consent boxes remain user-controlled.
- User's latest selected version has 392x600 mm, visibly confirmed; did not silently reset
  their physical dimensions. Previous print/fidelity/anatomy targets remain unresolved.

## Bidirectional review

Code-to-Spec ALIGNED and Spec-to-Code ALIGNED for this bounded coverage correction.
An 82% IMAGE-frame fit is not anatomical segmentation or a true circumferential calibration.
The 400 mm generated-calf-frame assumption is explicitly illustrative. Supported Spanish
phrases are bounded; controls offer a deterministic route without relying on text recognition.
Existing dirty-tree work is preserved. No commit or deployment. Guard result recorded below.

Documentary coverage: PASS (--base HEAD, TASK-0022 impact-review.json). This check does not
independently establish functional alignment; that conclusion uses the evidence above.
