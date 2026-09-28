---
type: adr
status: proposed
id: ADR-0016
created: 2026-09-26
supersedes_clause: ADR-0007 ("no generative pass after placement")
---

# ADR-0016: Activate the constrained AI blend for the on-body mockup

## Context

ADR-0002 committed the mockup to a hybrid pipeline: a deterministic geometric warp that is
authoritative for design shape, followed by a **constrained AI blend** that integrates the warped
design into skin (lighting, texture, subsurface softening, edge settling) without altering its
geometry. MOCKUP-INV-001/002 and PROD-INV-001 encode that boundary, and ADR-0006 already anticipated
sending screened body photographs to a third-party provider for exactly this pass, with a full
privacy posture built before the feature.

ADR-0007 (TASK-0019) then shipped **geometric-only** compositing as an interim measure, explicitly
because the blend had not been validated: it states "there is no generative pass after placement".
That was a freeze pending evidence, not a reversal of ADR-0002. FINDING-0001 remains open and names
the concrete candidate editors (GPT-Image-2.5 Sunburst; Flux edit families) and the open questions:
geometry preservation within tolerance, content policy on real bodies, and no-training terms.

The product owner has decided to activate the blend: the mockup should read as ink under skin, not
a decal. This ADR records that decision and the boundary it must not cross.

## Decision

Lift ADR-0007's interim "geometric-only" freeze and implement the ADR-0002 blend pass, in the
`ai_blend` node of the `orchestration` graph (ADR-0015), subject to every existing guard:

1. **Geometry stays authoritative and preserved.** The geometric warp defines design shape. The
   blend may change how the ink *sits*; it may not change what the ink *is* (MOCKUP-INV-001,
   PROD-INV-001). The blend is an image-*editing* pass on the warped composite, never a generation
   from scratch and never a redraw.
2. **The geometry check is load-bearing.** The blended output is compared against the pre-blend
   warp; if design geometry moves beyond the TASK-0008 tolerance, the render fails rather than
   shipping a design that disagrees with the stencil (MOCKUP-INV-002). This is the same check
   ADR-0002 made mandatory.
3. **The stencil is untouched.** The thermal stencil remains the native line-art centerline vector
   trace of the master (ADR-0003). It is never derived from the blended render. PROD-INV-001 holds:
   the mockup and the stencil are the same artwork.
4. **The photograph is gated, minimal and provider-constrained.** The body photo reaches the blend
   provider only after passing the safety input gate, carrying a `SafetyClearance` bound to the
   screened bytes (SEC-INV-007, GEN-INV-003), with EXIF stripped (SEC-INV-002), over TLS, under
   recorded adult consent (ADR-0006). Only a provider with a contractual no-training / no-retention
   guarantee is eligible (SEC-INV-001, GEN-INV-002). The generated output passes the safety output
   gate before it is stored or shown (SEC-INV-006).
5. **The blend provider is chosen by measurement, not preference.** TASK-0008 evaluates candidates
   on a fixed corpus of consented or synthetic photographs and selects the one that stays within
   the geometry tolerance *and* satisfies the photo-policy and data-handling requirements. Until a
   provider satisfies all three, the pipeline keeps geometric-only as the documented fallback
   (ADR-0002's retained fallback) — the feature degrades, it does not ship unguarded.

## Alternatives considered

- **Keep geometric-only (status quo, ADR-0007).** Retained as the fallback when no provider passes
  TASK-0008. Correct and private, but reads flat.
- **AI inpainting from scratch.** Rejected by ADR-0002 and unchanged here: it redraws the design and
  violates PROD-INV-001.
- **Send only a crop of the placement zone rather than the whole photo.** Not adopted as a
  requirement, but recorded as a data-minimisation option worth measuring in TASK-0008; it may
  reduce exposure without affecting blend quality.

## Consequences

- The mockup becomes the most expensive and highest-latency path in the system (local depth plus a
  hosted edit call), as ADR-0002 already warned.
- A new honest failure mode — "geometry tolerance exceeded" — must surface to the user rather than
  being hidden by loosening the threshold.
- `generation`'s image-to-image / inpaint path, currently unreachable because `SafetyClearance` is
  uninstantiable without a screened photo, becomes reachable **only** through a real clearance.
- Provider selection is now constrained by data-handling terms and photo policy, not only quality;
  GEN-INV-002 moves from unverified toward a gating requirement that must be evidenced before launch.
- ADR-0006's blocking pre-launch items (legal review, DPIA decision, retention window, residency)
  now sit on the critical path for this feature, not a later one.

## Affected specs/modules

`mockup` (owner), `generation`, `safety`, `orchestration`, `product-behavior` (activation note),
`quality-and-security`, `architecture`.

## Validation / revisit conditions

Validated in TASK-0008 (the mockup spike) and TASK-0032 (this activation). Blocking:

1. A measurable geometry tolerance and a method to measure it (ADR-0002's condition 1). The
   method exists and is verified on synthetic scenes (`mockup/geometry.py`, TASK-0008
   preparation, 2026-09-26); the numeric tolerance is still owed.
2. The blend stays within tolerance at an acceptable rate on the fixed corpus (condition 2).
3. The blended result is visibly better than geometric-only (condition 3); if not, drop the pass.
4. A provider whose photo policy accepts consented body images and whose terms satisfy SEC-INV-001.

If (2) or (4) fails, fall back to geometric-only and leave ADR-0007's outcome in force for the
mockup, amending this ADR to record why. The spec is never rewritten to match whatever the chosen
model happens to produce.
