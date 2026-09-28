---
type: adr
status: accepted
id: ADR-0018
created: 2026-09-28
amends: ADR-0016
---

# ADR-0018: The AI finish runs on generated plates, is chosen by measurement, and falls back

## Context

ADR-0016 activated the constrained AI blend for the mockup, but it was never switched on: no
provider was wired, the node ran only on an own photo, and the numeric geometry tolerance was
still owed. Every mockup so far has been the geometric composite. The owner asked for the agent to
produce the final mockup ("recuerda que decidimos que el agente creara el mockup final").

Most mockups are made on a generated skin plate, not on the client's photograph. A plate is no
one's photograph, so ADR-0016's photo conditions (clearance, consent, a provider with verified
no-training and no-retention terms, GEN-INV-002) do not arise for it. They still arise for an own
photo, and GEN-INV-002 is still unverified.

## Decision

1. **The finish runs on generated plates now, and declines own photos** until a provider's terms
   are verified. The decline is in the adapter (`app/studio.py::_StudioBlend`); the graph also
   refuses an own photo that arrives without its clearance.
2. **GPT-Image edits, chosen by measurement.** On the live Mestalla composite, GPT-Image stayed
   faithful in four of four runs (p95 displacement 0.93–1.58 % of the diagonal, ink IoU
   0.68–0.77), the worst only darkening the tone. FLUX.2 redrew the ornaments and the crest's
   outline in two of two runs (p95 1.99–2.08 %, IoU 0.48–0.53). This is ADR-0009's vendor-per-
   strength rule applied to a new pass: FLUX.2 keeps the plates, where its photographic skill is
   wanted, and is kept away from the one pass where redrawing is the failure.
3. **The tolerance is `max_p95_relative = 0.018`, `min_ink_iou = 0.62`** (`BLEND_TOLERANCE`), set
   between the two providers' results. One design is a thin corpus; the value is named, dated and
   revisable.
4. **A refused finish ships the geometric composite instead of failing the job.** This amends
   ADR-0016 decision 2 and ORCH-INV-004. The composite agrees with the stencil by construction,
   so delivering it keeps PROD-INV-001; failing a three-minute job over a cosmetic finish would
   not protect anything more. The transform records `finish` (`accepted`, `declined`,
   `unavailable`, `rejected_geometry`, `rejected_output`) and `generativePostprocess` is true only
   for `accepted`, which the status contract enforces.
5. **A re-placed design gets the same finish through the same nodes** (`build_finish_graph`),
   rather than a second copy of the logic.
6. Output moderation is the provider's `accept_output`, which already screens every generated
   image for explicit content before it returns (SEC-INV-006); a refusal there is `unavailable`.

## Alternatives considered

- **FLUX.2 for the finish.** More photographic, and it already makes the plates. Rejected by the
  measurement above: it changes what the ink is.
- **Keep failing the job on a refused finish** (ADR-0016 as written). Rejected in point 4.
- **Wait for own-photo terms before enabling anything.** Rejected: it would keep the finish off
  for the case where no photograph is involved at all.

## Consequences

- A new design costs one more image edit (about 80 s at high quality in the measurement runs) and
  its price. A re-placement costs one edit too, where it cost nothing before.
- The status contract changes: `generativePostprocess` is a boolean tied to `finish`, and
  `bodyFit` (TASK-0039) is admitted. TASK-0039 had shipped `bodyFit` outside the contract.
- `CLAUDE.md`'s hard constraint that the mockup is geometric only is replaced.

## Validation / revisit conditions

- **Revisit the tolerance** after more designs are measured; if a faithful finish is refused
  often, or a redraw passes, the numbers move and this ADR records why.
- **Revisit own photos** when GEN-INV-002 is verified for the chosen provider.
- **This decision is wrong if** clients read a finished mockup as the real healed tattoo; the
  illustrative labelling (PROD-INV-005) stays mandatory.
