---
type: finding
id: FINDING-0002
created: 2026-09-19
status: open
raised_by: TASK-0004
affects: [contracts, flash, stencil, mockup]
---

# FINDING-0002: The brief contract permits size combinations that cannot be rendered

## What was noticed

`tattoo-brief.schema.json` bounds each dimension independently: `widthMm` and `heightMm` are each
`5..600`. It places no constraint on their *ratio*.

So a brief of 5mm × 600mm validates cleanly. It is a legal `TattooBrief` in both runtimes, and the
corpus even contains a valid fixture at exactly those bounds (`size-at-both-bounds`).

That brief has an aspect ratio of 1:120. No diffusion model renders that usefully. TASK-0004 hit
this while testing FLASH-INV-003 — the invariant requiring a render to honour the brief's
proportions so that its millimetre size stays meaningful.

Evidence status: VERIFIED (`raster_size_for` tests, 2026-09-19).

## Why it matters

The first implementation silently clamped the short edge to a usable minimum. A 5×600 brief
produced a 256×1024 raster — aspect 1:4 instead of 1:120.

That is worse than failing. It reports success while returning artwork of the wrong shape, which
breaks FLASH-INV-003 invisibly and makes the brief's physical size meaningless downstream: the
stencil would print at a size whose proportions do not match what the user saw, and the mockup
would place a differently-shaped design than the one approved.

This is precisely the class of silent inconsistency the contract exists to prevent, arriving
through a gap in the contract itself.

## How TASK-0004 handled it

`raster_size_for` now raises `UnrenderableAspectError` when the ratio exceeds 1:8, rather than
clamping. The engine refuses and says why.

That is the correct local behaviour — fail loudly rather than lie — but it leaves the system in an
awkward state: **the contract accepts briefs that the engine will always reject.** A user can
complete a consultation, produce a valid brief, and only discover at render time that it cannot be
made. The failure has been moved to an honest place, not removed.

## Suggested resolution

Constrain the ratio in the contract, so an unrenderable brief cannot be constructed at all. JSON
Schema cannot express a relationship between two numeric properties directly, so the options are:

1. **Tighten the per-dimension bounds** so the worst legal ratio is renderable. Simple, but
   crude — it would forbid legitimately large designs to prevent a rare pathological pair.
2. **Add an explicit `aspectRatio` guard as a validated derived field.** Redundant data, and
   redundancy in a contract invites its own drift.
3. **Enforce the ratio in the consultation** (TASK-0003), which is where a brief is assembled, and
   record the constraint in `product-behavior.spec.md` as a product rule rather than a schema rule.

Option 3 is probably right: it catches the problem where the user can still do something about it,
and keeps the schema describing shape rather than policy. It does mean the guarantee is no longer
purely structural, which should be stated plainly wherever it is recorded.

Whichever is chosen, `contracts.spec.md` should note that dimension bounds alone do not make a
brief renderable.

## Not addressed here

TASK-0004 owns the flash path, not the brief contract. Changing the contract is a `contracts`
change with its own corpus and dual-runtime implications, and doing it inside this task would have
widened the scope well past what its acceptance criteria cover.

The 1:8 limit itself is a judgement call from what diffusion models handle, not a measured figure.
It deserves checking against real renders once credentials exist.
