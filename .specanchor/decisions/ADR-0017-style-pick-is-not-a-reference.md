---
type: adr
status: accepted
id: ADR-0017
created: 2026-09-28
amends: ADR-0012
---

# ADR-0017: A catalogue pick settles the style; it is not a reference

## Context

ADR-0012 point 6 made a catalogue pick a reference image (`verification: 'style_library'`), and
TASK-0030 made it reach the worker by reading the file from disk. In the first live use the owner
picked "Neotradicional · Animal" and generation failed: the render shows the tattoo on a forearm,
and the input gate rejects any image with a recognisable body part (`openai_moderation.py`,
SAFETY-INV). The gate is right to do so, and the owner then stated the intent directly: the client
chooses which style they like, and the tattoo is made in that style. The picture is not wanted as
a reference.

Sending the picture also carried two things nobody asked for: its subject (a tiger, into a Valencia
CF crest) and its body (an arm, into a flash design).

## Decision

1. **A pick is a style decision.** The `style_variant` action sets `slots.style.primary` and
   records `OrchestrationSession.stylePick` (`id`, `style`, Spanish `label`). It adds nothing to
   `references`, so the image is never uploaded, moderated or sent to a model.
2. **Only the style reaches the design.** The variant's `characteristics` describe a subject
   ("stylised animal portrait") as much as a style, so they are not sent either. The style phrase
   from `style-library.json` already reaches the prompt through `brief.style.primary`. This keeps
   the owner's rule that models keep their creative room.
3. **The pick is shown in the brief** ("Neotradicional · Animal") and highlighted in the picker. It
   is part of what the client accepts (ADR-0013), and it is forgotten when the style changes.
4. `'style_library'` is removed from `ReferenceImage.verification`, and `catalogueBytes` and
   `isCatalogueSource` (TASK-0030) are removed with it: nothing produces a catalogue reference.

ADR-0012 is otherwise unchanged: the catalogue is still generated once, served statically and
labelled as illustrative renders.

## Consequences

> **Amended by ADR-0026 (2026-09-30).** A generic idea no longer needs a reference and a
> job may carry none, so the blocked case below now applies only to essential references.

- **A pick no longer satisfies "referencia visual".** `studio-job.schema.json` requires at least
  one reference, and the worker uses the first as the lineage parent of every artifact. When the
  scout finds nothing and the client uploads nothing, generation stays blocked and the client is
  sent to «Referencias». Before, the pick covered that case. Allowing a reference-free design is a
  contract change to the job schema and the lineage rule, and is left to its own task.
- Catalogue renders that show skin stay acceptable as pictures, since none is ever moderated.

## Validation / revisit conditions

- **Revisit if** clients report that the design ignores the variant they chose, which would mean
  the style phrase alone is too coarse and a style-only wording of the variant is needed.
