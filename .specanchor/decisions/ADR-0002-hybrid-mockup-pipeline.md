---
type: adr
status: proposed
id: ADR-0002
created: 2026-09-19
---

# ADR-0002: Hybrid mockup pipeline — geometric warp, then constrained AI blend

## Context

Placing a flat design on a photograph of a body is the hardest problem in the system, and the two
obvious approaches fail in opposite directions.

**Pure AI inpainting** — hand the model the photo, the design and a mask — produces the most
photorealistic skin integration and requires the least code. But image models regenerate what they
are given. The design comes back subtly redrawn: line weights shift, small elements move, text
degrades. For a general image tool that is acceptable. For a tattoo preview it is disqualifying,
because the user is deciding whether to put *this specific artwork* on their body permanently, and
the tattooer will work from a stencil of the original. A mockup showing a different design than
the stencil is worse than no mockup.

**Pure geometric compositing** — estimate depth and normals, build a UV warp, composite with a
multiply blend — preserves the artwork exactly. But it reads flat: it misses the way ink sits
under the epidermis, loses the interaction with specular highlights, skin texture and fine
shadowing, and tends to look like a decal.

## Decision

Use both, in order, with a hard boundary between them:

1. **Surface estimation.** Depth, normals and a skin-region mask from the photograph, computed
   locally.
2. **Geometric warp.** The design is warped onto the estimated surface. This step is authoritative
   for design shape and is fully deterministic.
3. **Constrained AI blend.** A low-strength pass integrates the warped design into the skin:
   lighting, texture, subsurface softening, edge settling. It may change how the ink *sits*. It
   may not change what the ink *is*.
4. **Geometry check.** The output is compared against the pre-blend warp. If design geometry moved
   beyond tolerance, the render fails rather than shipping a wrong design.

The tolerance is a numeric threshold on landmark displacement between the pre-blend warp and the
final output. Its value is not yet defined; TASK-0008 must define it before the mockup module can
leave `draft`.

## Alternatives considered

- **AI inpainting only.** Rejected: violates PROD-INV-001. The design must survive intact.
- **Geometric only.** Not rejected — retained as the documented fallback. If the spike shows the
  blend pass cannot stay within tolerance, this becomes the shipped pipeline. It is correct, just
  less convincing.
- **3D body reconstruction with a rendered material.** Highest ceiling on realism. Rejected as far
  too large for v0.

## Consequences

- The most moving parts of any module in the system, and the highest latency: local depth
  estimation plus a hosted generation call.
- A new failure mode — tolerance exceeded — that must be surfaced honestly rather than hidden by
  loosening the threshold.
- The geometry check is load-bearing. Without it this decision provides no protection at all,
  since the blend model is free to redraw.
- Requires a fixed corpus of body photographs for testing, which must be synthetic or consented,
  never retained user uploads.

## Affected specs/modules

`mockup` (owner), `generation`, `media`, `product-behavior`, `architecture`.

## Validation / revisit conditions

**This decision is unvalidated.** TASK-0008 is a timeboxed spike that must, on a fixed corpus of
real photographs across varied skin tones, body parts and lighting:

1. Establish a measurable geometry tolerance and a method for measuring it.
2. Show the constrained blend pass stays within that tolerance at an acceptable rate.
3. Show the blended result is visibly better than the geometric-only composite.

If (2) fails, fall back to geometric-only and amend this ADR. If (3) fails, the blend pass is cost
without benefit and should be dropped.

The spec is not to be rewritten to match whatever the implementation happens to produce.
