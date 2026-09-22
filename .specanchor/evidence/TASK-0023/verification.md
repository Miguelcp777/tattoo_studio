# TASK-0023 verification — 2026-09-21

The user's actual 150x500 mm job had a 1260px placement height but only 547px visible ink.
White master padding caused the discrepancy. This invalidated the earlier inference that
canvas height alone established visible coverage (TASK-0022). New checks measure ink pixels.

Recomposed the exact affected job locally, retaining identical master, stencil, mirror,
PDF and background asset IDs. No image generation or stencil tracing. New job and crop
are recorded in live-result.json. Visible ink height increased from 547px to 1237px on
the same 1536px-high background. Visually inspected the actual corrected mockup; it is
large and retains the original narrow artwork proportions. No claim of lateral wrap or
measured anatomy. Local before/after: services/worker/.artifacts/qa-task0023/.

Regression verification: worker studio tests 20 passed, including padded 150x500 source,
actual pixel-extent comparison, source immutability, unchanged calibrated projection,
and full-zone initial-prompt routing. Scoped ruff and mypy app passed (9 files).
Shared TypeScript typecheck passed. Further check outputs recorded below.

Code-to-Spec and Spec-to-Code ALIGNED for visible-coverage correction. Original print
assets can retain margins; this does not certify physical ink dimensions or 3D anatomy.
No unrelated work reverted, no commit/deployment. User's original proposal is preserved.
