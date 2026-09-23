---
type: adr
status: proposed
id: ADR-0014
created: 2026-09-23
---

# ADR-0014: The ink reads the photograph, and never deforms the artwork

## Context

Two observations from the owner on a real render — a German Shepherd on an upper back:

1. The fresh-ink reddening is too weak to notice.
2. The tattoo looks flat, as if pasted on.

Both were checkable rather than matters of taste.

**On the reddening.** The effect was measured at 3.6 % of pixels changed, peaking at +17 levels
of red-minus-blue. Turning the strength up alone was tried and is wrong: the halo is a dilation
of the ink coverage, so it sits *on* the strokes as well as around them. Solid black hides the
tint, but this design is mid-grey shading, which let it through — at 2.8× the whole animal went
warm. A fresh tattoo irritates the skin *around* the strokes; the pigment stays as it is.

**On the flatness.** The job's own recorded transform settles it:

```
bodyPart:  upper_back
curvature: None
taper:     None
```

The existing cylindrical warp applies only to limbs — calf, shin, forearms, upper arms, thighs.
A back is not in that set, so the composite was a plain planar multiply with no surface term at
all. It was not an illusion of flatness; it was flat.

The obvious next step was a displacement field derived from the photograph's shading, and it was
built and measured. **It does not work.** At ±0.06 of the design's width the animal's muzzle and
ears warp visibly; at 0.03, where nothing deforms, nothing much is gained either. Any
displacement strong enough to read as curvature also reads as *the design is wrong*, which
MOCKUP-INV-001 exists to prevent: the client is deciding whether to wear this specific artwork.

## Decision

**1. The fresh-ink halo becomes a ring.** The ink coverage is subtracted from the dilated halo,
so the warmth lands on skin and not on pigment. Strength is `DEFAULT_FRESHNESS = 2.0`, chosen by
looking at a real render rather than at a number.

**2. Surface form is expressed as attenuation, never as displacement.** Where the photograph's
own blurred luminance says the body turns away, the ink's opacity is reduced: ink seen at a
grazing angle reads lighter and lower in contrast. `DEFAULT_SURFACE = 0.35`. Above roughly 0.5 it
reads as faded rather than curved.

**3. It applies everywhere, not only to limbs.** The term is read from the photograph rather than
assumed, so it suits a back or a chest as readily as a calf. The cylinder stays as it is, for the
zones where a cylinder is a fair description.

**4. Both are recorded in the transform**, beside `curvature` and `taper`, for the same reason
those are: the render should say what was done to it.

## Alternatives considered

**Raise the freshness multiplier and stop there.** Measured and rejected: it tints the artwork.

**Add the back and chest to the cylinder set.** One line. Rejected: a back is a broad convex
surface with the spine's valley through it, not a tube. It would replace one wrong shape with
another and look worse for being more confident.

**Displacement from the photograph's luminance gradient.** Built, measured, rejected on the
evidence above. Kept in this record because the negative result is the useful part: this is the
obvious idea, and it fails against MOCKUP-INV-001 rather than against taste.

**Real depth estimation and segmentation.** The honest answer to flatness, and still the
standing intent in `mockup.spec.md`. Not attempted here: it is a model, not a filter, and this
change is a filter. Attenuation does not pretend otherwise.

## Consequences

- Every mockup now carries a surface term, including body parts that previously had none. Renders
  made before this will differ from renders made after, which is visible in version history.
- Attenuation is derived from whatever lighting the photograph happens to have. A flatly lit plate
  yields no form and therefore no effect, which is correct but means the improvement is uneven
  across backgrounds.
- The transform contract gains two fields. Nothing reads them yet beyond the record itself.
- **It is still not depth.** The ink follows the photograph's shading, not the body's geometry.
  A limb photographed with flat studio light will still look flat, and it should.

## Affected specs/modules

`mockup`, `contracts`, `platform`.

## Validation / revisit conditions

- **Revisit if** a tattooer says the attenuated ink reads as faded rather than curved; the
  strength is one constant.
- **Revisit when** depth estimation lands, at which point this becomes the fallback for
  uncalibrated input rather than the only surface term.
- **This decision is wrong if** the attenuation makes designs look washed out on dark skin, where
  the luminance range is compressed and the falloff may misread the form. That has not been
  tested: every background exercised so far has been light-skinned.
