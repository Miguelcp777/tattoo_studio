# TASK-0020 verification — 2026-09-20

## Implemented and verified

- REQ-001: official Valencia CF SVG source, bounded Commons alternatives and missing-only
  retry. Live isolated consultation found statue, flag and official crest automatically,
  with zero questions. `live-result.json` records the successful public-reference job.
- REQ-002: rendered preparing/running indicator, indeterminate animation and elapsed time
  checked in a temporary development route, subsequently removed. No invented percentage.
- REQ-003: existing session mockup and stencil opened in rendered detail views; zoom,
  reset, return, focus restoration and native scrolling checked. Stencil reached 400%.
- REQ-004: initial live fresh-ink result was rejected by the user as too flat. Refined
  renderer now uses a 2D tapered cylindrical mesh (calf: 1.05 radians, taper 0.25), bowed
  transverse rows and a dilated/blurred surrounding redness mask. Source master and
  stencil are unchanged by composition. Generated one new blank calf for local comparison,
  reusing the public test master; did not regenerate artwork or upload the supplied photo.
  Inspected `services/worker/.artifacts/qa-task0020/mockup-refined.png` visually: narrowed
  lower placement, retained pores/lighting and localized pink halo. It is an approximation,
  not photo-derived anatomy. User acceptance of hyperrealism remains OPEN.

## Checks

- Worker full pytest: 270 passed (one upstream Starlette deprecation warning).
- Worker ruff for affected Python files: passed; mypy app: 9 files passed.
- Contracts TypeScript: 98 passed after curvature/taper schema regeneration.
- Workspace TypeScript typecheck: passed after regeneration.
- Earlier in this task: consultation 17 tests, web 18 tests, Python contracts 110 tests
  passed; rendered progress and zoom verified. No production deployment or commit.
- New pixel regression checks prove lower calf narrowing, pink outside dark pigment,
  unchanged remote skin, deterministic rendering and source immutability.
- Full SDD guard reports "Affected acceptance criterion not passing" because AC-004
  visual acceptance remains open; this is not recorded as a passing full review.
- Worker restarted after verifying zero queued/running jobs; application startup succeeded.

## Alignment

Code-to-Spec: PARTIAL. Spec-to-Code: PARTIAL. REQ-001 through REQ-003 have scoped passing
evidence. REQ-004 software checks pass, but no claim of 100% anatomical fit or accepted
hyperrealism. TASK-0019/AC-008 exact professional stencil and canonical fidelity remain
open. Retain both tasks in progress. The guard measures documentary coverage only.

All pre-existing working-tree changes were preserved. Generated comparison files remain
in ignored local artifacts; the user's original browser result was not replaced.
