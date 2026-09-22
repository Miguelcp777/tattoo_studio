---
type: adr
status: proposed
id: ADR-0009
created: 2026-09-22
---

# ADR-0009: Route each image vendor to what it is already good at

## Context

A contributed change added BFL FLUX.2 as a wholesale replacement for every studio image call:
line art, colour artwork, edits and the blank skin background, selected by
`TATTOO_IMAGE_BACKEND=bfl`. It arrived with 23 passing adapter tests and no live call, because
the contributing session had no credential.

Two live calls were then made against the real API (VERIFIED, 2026-09-22).

**The adapter works.** EU cluster, submit, poll, signed-URL download without leaking the
credential to the delivery host, and OpenAI output moderation over the result: 25.8 s for the
first call, 1024x1536 PNG.

**The artwork is unusable.** `artwork_prompt` opens with *"Create a FLAT COLOUR TATTOO ARTWORK
on pure white, not a skin photograph"*. FLUX.2 returned the wolf **already tattooed on a leg**.
A second call prepended and appended an explicit restriction — *"no skin, no body, no arm, no
leg, no person anywhere in the image… this is artwork on paper, not a photograph of a tattoo"* —
and changed essentially nothing:

| | Call 1 | Call 2, restriction added |
|---|---|---|
| Pixels the pipeline reads as white | 38.1 % | 39.7 % |
| `visible_artwork` crop, as a share of the frame | 74.3 % | 76.1 % |

This is not a prompt defect, it is what the model has learned: "tattoo artwork" overwhelmingly
means a photograph of a tattoo on skin.

It matters because the whole pipeline defines ink as *any non-white pixel*
(`visible_artwork`: `min(axis=2) < 245`). A master with a skin-toned limb in it means:

- the visible-ink crop captures the leg, not the design;
- TASK-0024 zone sizing measured **188 mm** of width for a calf whose reference span is 140 mm,
  because it read the limb's proportions instead of the artwork's;
- `composite` multiplies the master over the photograph, so a skin-toned master darkens the
  whole placement rectangle into a visible patch;
- the stencil trace would trace the limb silhouette and skin texture as if they were strokes.

A third live call then exercised the background path with the unmodified production prompt.
FLUX.2 returned a bare calf, no ink, skin filling the frame: 87.2 % skin-toned pixels, every
row more than half skin, 23.3 s. That is precisely what `background()` asks for, and it is at
least as good as the OpenAI equivalent.

## Decision

**Each vendor serves the call it is already good at, and the constraint lives in the routing
rather than in the prompt.**

- `TATTOO_IMAGE_BACKEND=bfl` changes the **skin background only**. FLUX.2 renders the blank
  plate, text-only, and only when the client supplied no photograph of their own.
- Artwork, edits, reference analysis and output moderation stay on OpenAI, inherited unchanged.
- The shared prompt helpers are **not** rewritten to police either model. No "do not draw skin"
  clauses are added anywhere.
- `image_model` continues to carry an OpenAI model name even under the `bfl` backend, because
  the inherited artwork path posts it to `api.openai.com`.

## Alternatives considered

**Keep fighting the prompt.** Measured and rejected: two live calls, a restriction stated twice
in the same prompt, no effect. Further prompt engineering is unfalsifiable spending.

**Post-process the master to strip the skin.** Segment the limb out and keep the artwork.
Rejected: that is a generative correction to the authoritative master, which ADR-0007 forbids,
and it would silently alter the design the client is deciding to wear permanently.

**Use FLUX.2 everywhere and accept the artwork quality.** Rejected on measurement, not taste:
the failure corrupts geometry the stencil depends on, not just appearance.

**Drop FLUX.2 entirely.** Tempting, since OpenAI already renders backgrounds. Rejected because
the background is the one place where photographic realism is the actual goal, and the live
result was strong. Keeping the adapter also preserves a second vendor for the one call that
never touches client data.

## Consequences

- Two vendors are in the path when `bfl` is selected, so a design depends on both being up.
  Failures stay terminal and explicit; no silent fallback, because a silent fallback would bill
  the wrong vendor and hide an outage.
- `TATTOO_BFL_EDIT_MODEL` is removed. `flux-2-max` is not used by anything.
- The contributed `_artwork` and `edit_artwork` overrides are deleted. Their tests are replaced
  by tests asserting those paths stay on OpenAI, which is the behaviour that now matters.
- **GEN-INV-002 is still unsatisfied**, for BFL as for fal: no provider's no-training and
  no-retention terms have been read. This decision narrows the exposure — FLUX.2 now receives
  only a text prompt naming a body part, never a reference image or a photograph — but it does
  not discharge the invariant.

## Affected specs/modules

`generation`, `platform`. No change to `contracts`, `mockup`, `stencil` or `web`.

## Validation / revisit conditions

- **Revisit if** a FLUX.2 release renders flat artwork on white when asked. Re-run the two
  measurements above; they are cheap and the criterion is unambiguous.
- **Revisit if** the two-vendor dependency causes real outages, in which case a single-vendor
  path is worth the quality loss.
- **This decision is wrong if** the backgrounds FLUX produces are worse for the mockup than
  OpenAI's despite looking better in isolation — for example if the hair, tone or lighting it
  favours makes the composite read less convincingly. That has not been measured, and one
  sample is not evidence.
