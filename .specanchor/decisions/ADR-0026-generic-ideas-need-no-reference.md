---
type: adr
status: accepted
id: ADR-0026
created: 2026-09-30
amends: ADR-0017
---

# ADR-0026: A generic idea needs no reference; Openverse joins Commons

> **Amended by ADR-0030 (2026-10-01).** An essential reference the licensed sources lack is searched on the web through Brave, and judged.

> **Amended by TASK-0067 (2026-10-01).** A missing essential reference no longer blocks for good: the client may go on without it after a warning that the design will be an interpretation.

## Context

On the deployed studio the owner asked for a biomechanical tattoo on the right thigh. The scout
ran: Claude planned three searches and its judge looked at the Commons candidates five times, once
per press of «Buscar las referencias pendientes», keeping none. The event record (ADR-0024) showed
it: one `scout_plan` call, five `scout_judge` calls, 49 output tokens in all. Commons answers
"biomechanical tattoo" with papers on biomechanics. With no reference the consultation blocked
generation; the retry repeated the same searches, so it looked as if the button did nothing.

ADR-0017 had recorded this consequence: with the catalogue pick no longer a reference, "generation
stays blocked" when nothing is found, and "allowing a reference-free design is a contract change to
the job schema and the lineage rule, and is left to its own task". The owner chose to make that
change, and to add Openverse as a source.

## Decision

1. **Only an essential reference blocks.** A specific real-world entity whose exact look matters
   (a named emblem, flag, landmark, statue, artwork or logo — the planner's `essential`, or a curated
   query) still has to be found or supplied. A generic idea no longer needs any reference: the
   consultation stops adding "referencia visual", and the phase is ready once the brief is complete
   and nothing essential is missing.
2. **A job may carry no reference.** `studio-job.referenceIds` admits an empty array. The worker then
   skips the reference analysis, tells the image model that no reference is supplied, and uses the
   generations endpoint, since the edits endpoint needs an image. A design with no reference is its
   own lineage root; erasing the account still removes it (MEDIA-INV-006 is unchanged).
3. **Nothing to review, nothing to confirm.** With no reference the «He revisado que las referencias
   corresponden a mi idea» checkbox is not shown and does not gate generation.
4. **Openverse is a second licensed source.** With the judge, both Commons and Openverse candidates
   are offered; without it, Openverse is asked only when Commons has nothing. Searches ask only for
   licences that allow derivative works (`license_type=modification`) and exclude mature results.
   Only Openverse's own thumbnail URL, of one exact shape, is used, and it is the only Openverse URL
   the web tier will download (SSRF allowlist).
5. **The judge rejects every image with a person or a body part in it**, including tattooed skin.
   The input gate refuses such a reference at generation anyway (SAFETY-INV, ADR-0017's finding);
   rejecting it at the judge avoids a proposal that fails at the last step.

## Consequences

- A generic design is drawn from the words alone. It follows the style phrase and the brief; it
  cannot be more faithful than they are.
- Most Openverse tattoo results are photographs of tattooed bodies and are rejected by rule 5. What
  Openverse adds is drawings, flash, artwork and objects under open licences. In the live run on the
  biomechanical idea the judge still kept nothing, and the idea was ready to generate without one.
- Openverse licences include non-commercial ones (CC BY-NC). The licence and the creator are shown
  beside each reference. Commercial use of the studio needs a decision on whether NC references are
  acceptable; `license_type=commercial,modification` is the switch, at the cost of far fewer results
  (2 against 13 for "biomechanical tattoo").
- Openverse thumbnails are proxied and sometimes answer 424. A candidate whose thumbnail does not
  download is never shown to the judge.

## Validation / revisit conditions

- **Revisit if** clients report that generic designs miss what they meant, which would argue for a
  reference being asked for again, or for a better source of style references.
