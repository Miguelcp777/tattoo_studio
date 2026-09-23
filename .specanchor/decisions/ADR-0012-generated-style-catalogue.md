---
type: adr
status: proposed
id: ADR-0012
created: 2026-09-23
---

# ADR-0012: A generated style catalogue, shown rather than described

## Context

A client who writes *"quiero un tatuaje tribal"* is asked, today, to settle a style from a word.
Tribal covers at least three families that look nothing alike. The owner asked for the agent to
show three examples and let the client point at one, and for that choice to feed the final design
alongside anything they uploaded.

The images have to come from somewhere, and each source carries a real problem:

- **Photographs of real tattoos** are someone's copyrighted work, often in a recognisable artist's
  hand. Feeding one to a generator as a reference is a worse version of the imitation
  PROD-INV-004 forbids — it is imitation without even naming who is being imitated.
- **Wikimedia Commons** is licence-clean and already wired (`image-scout.ts` records `license` and
  `sourcePage`), but its tattoo coverage is thin and uneven. Three good tribal exemplars are not
  reliably there.
- **Licensed stock** is the best quality and needs money and administration nobody has committed.

A fourth option only became attractive because of ADR-0009: FLUX.2 renders photographic tattoos on
skin extremely well — so well that it does it when asked not to, which is exactly why it was
rejected for artwork. A catalogue wants precisely that.

## Decision

**The catalogue is generated once, committed, and served as static assets.**

1. Sixteen styles × three variants = 48 images, generated from the same visual-characteristics
   strings the design pipeline uses, rendered by FLUX.2 through the existing provider.
2. They are downscaled to 512×768 WebP. At a median 75 KiB the whole catalogue is 3.7 MB, which a
   repository can carry; the 1024×1536 originals would have been about 125 MB and could not.
3. **The style phrase is held once**, in `contracts/reference/style-library.json`. The string
   shown to a client, the string sent to the image model for the catalogue, and the string sent
   for their actual tattoo are the same string. `flash/prompt.py` reads it rather than declaring
   it.
4. **The generator lives in `services/worker/generation/`**, because ARCH-INV-001 confines
   outbound model calls to that module and `safety`. A script under `scripts/` would have been the
   obvious home and would have violated it. The runner sits in `app/`, the composition root,
   because `generation` may not import `app` without closing a cycle.
5. **A pick is resolved server-side from an identifier.** The client sends `tribal:maori`; the
   route resolves it against the catalogue and refuses anything that does not. No caller can
   introduce an arbitrary image as a studio reference.
6. **Provenance is recorded and shown.** These references carry `verification: 'style_library'`,
   never `user_supplied`, and the interface says they are illustrative renders rather than
   photographs of real work.

## Alternatives considered

**Describe the styles in words.** No images, no cost, no licensing. Rejected: it is what the
product already does, and it is the thing the owner asked to replace. A style is a visual fact.

**Generate variants on demand and cache.** Spreads the cost over styles people actually request.
Rejected for the catalogue: the first client to ask for tribal would wait 75 seconds to be shown a
choice, which defeats the point of offering one.

**Keep the style phrases in `flash/prompt.py` and write separate catalogue prompts.** Less
plumbing. Rejected: two descriptions of the same style drift, and then the picture a client chose
stops matching the tattoo they are sold. That is the drift ADR-0004 exists to prevent, applied to
prose instead of schemas.

## Consequences

- **The catalogue is renders, not real work, and must always say so.** A client who believes they
  are looking at a real tattoo is being misled about what the studio can deliver.
- Adding a style now costs three generated images as well as a phrase. That is a reasonable brake.
- The repository carries 3.7 MB of binary assets it did not before. ADR-0010 declined to add
  images for decoration; this is content, and the distinction is that the client makes a decision
  from it.
- The provider's content filter refuses some perfectly ordinary tattoo descriptions. Four of 48
  were refused on the first pass, two of them repeatedly. Regeneration is resumable precisely
  because a failure must not re-spend on what already succeeded.

## Validation / revisit conditions

- **Revisit if** a tattooer says the catalogue misrepresents a style. Regenerating one variant is
  a single call and the characteristics are one line of shared data.
- **Revisit if** clients pick the same variant regardless of what they asked for, which would mean
  the three options are not actually distinguishable.
- **This decision is wrong if** clients read the catalogue as a portfolio. Nobody has watched
  anyone use it, and the disclaimer is the only thing standing between an illustrative render and
  a promise.
