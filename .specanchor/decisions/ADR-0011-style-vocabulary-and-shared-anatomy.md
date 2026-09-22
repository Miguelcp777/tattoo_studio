---
type: adr
status: proposed
id: ADR-0011
created: 2026-09-22
---

# ADR-0011: Widen the style vocabulary, and make reference anatomy a shared contract

## Context

Two problems surfaced from the same request: the agent should fill style, zone and colour from
what the client writes, and should default the size from qualitative words like *grande* or
*pequeño*.

**The vocabulary was too narrow to accept the request.** `styleName` held ten entries. The
owner's own example — *"quiero un tatuaje tribal"* — could not be recorded, and the repository
knew it: `tribal_freehand` appears in exactly one place, as
`contracts/fixtures/tattoo-brief/invalid/style-outside-vocabulary.json`, the fixture proving that
out-of-vocabulary styles are rejected. CONSULT-INV-003 turns such a request into a clarifying
question, which is correct behaviour for a typo and wrong for a mainstream style.

**A qualitative size cannot be resolved without anatomy.** *Grande* on a wrist and *grande* on a
back are not the same tattoo, so the word only means something against a zone. The reference
spans existed — `mockup/anatomy.py`, added by ADR-0008 — but in Python, while the brief is
assembled in TypeScript. Writing a second copy of the table in TypeScript would create exactly
the drift ADR-0004 exists to prevent: two runtimes resolving a size from numbers that can quietly
diverge.

## Decision

**1. Six styles are added to the closed vocabulary**: `tribal`, `geometric`, `watercolour`,
`new_school`, `chicano`, `biomechanical`. Each is commonly requested, visually distinct from the
existing ten, and not already expressible as a `shading.technique` — which is why `dotwork` is
not among them, and why `minimalist` is not, being covered by `fine_line`.

The vocabulary stays closed. This widens it; it does not open it.

**2. Reference anatomy becomes shared contract data.** `contracts/reference/body-zones.json` is
canonical. The Python generator copies it into the package byte-identically, exactly as it
already does for the schemas, and a test asserts the copy matches. `mockup/anatomy.py` reads it
instead of declaring it; TypeScript imports it from `@tattoo/contracts`.

**3. A qualitative size resolves as a fraction of the zone**, with the fractions declared in the
same file (`small` 0.40, `medium` 0.68, `large` 1.00). `large` fills the zone, which is what a
whole-zone request already resolves to under ADR-0008. An explicit measurement always wins, and
when the zone is unknown no size is proposed at all — guessing would mean inventing a body part
the client has not named.

## Alternatives considered

**Map `tribal` onto `blackwork`.** No contract change. Rejected: they are different styles, so
the brief would record something the client did not ask for, and the stencil would follow the
wrong description.

**Leave it to the style library to disambiguate.** The agent shows variants and stores the
nearest curated style plus the chosen reference. Rejected as the whole answer — the image carries
the real information, but the brief would still name a style the client rejected, and the brief
is what the tattooer reads. It remains a good complement, which is the next task.

**Duplicate the anatomy table in TypeScript.** Quickest. Rejected on the project's own terms:
ADR-0004 makes a single source of truth the rule precisely because two hand-maintained copies
drift, and a size is exactly the kind of number nobody re-checks.

**Express qualitative sizes as absolute millimetres.** `pequeño` = 60 mm, and so on, with no zone
involved. Simple and no shared data needed. Rejected: it produces a wrist-sized *grande* on a
back and a back-sized *pequeño* on a wrist.

## Consequences

- Every new style needs a visual-characteristics phrase in `flash/prompt.py`; an existing test
  enforces this, and it caught all six the moment the vocabulary widened. Those phrases describe
  what the style looks like rather than naming it, following the TASK-0004 finding that naming a
  style yields a generic result.
- The scale fractions are a stated convention, as arbitrary as the spans they multiply. They are
  declared in one reviewable file rather than scattered.
- `contracts/` now holds non-schema data. The distinction to keep is that the schemas are
  *contracts about shape* and this is a *contract about shared values*; both are things two
  runtimes must agree on exactly.
- The style library that follows must cover sixteen styles rather than ten.

## Validation / revisit conditions

- **Revisit if** clients keep asking for styles still outside the sixteen. The list should track
  what people actually request, not what is tidy.
- **Revisit if** a tattooer says the scale fractions are wrong; like the spans, they are the
  cheapest thing here to correct.
- **This decision is wrong if** widening the vocabulary degrades the generated artwork, because
  each style now carries a phrase that has never been rendered. None of the six new phrases has
  been tested against a real generation.
