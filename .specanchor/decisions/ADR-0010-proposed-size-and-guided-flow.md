---
type: adr
status: proposed
id: ADR-0010
created: 2026-09-22
---

# ADR-0010: The studio proposes the size, and the client is guided rather than quizzed

## Context

CONSULT-INV-004 reads:

> Size is captured in millimetres, and the user is asked for it explicitly rather than having it
> inferred.

That invariant is both **stale** and **already violated by the implementation**:

- `packages/consultation/src/providers/openai-astra.ts:27` instructs the model to return a
  *"Recommended physical size in millimetres appropriate for that anatomy"*, with per-zone
  examples. Inference is the shipped behaviour.
- `missingPreferences` — the list that actually gates brief completion — never included size.
- But `orchestrator.ts` pushed `'medidas en mm'` into `missingFields`, so the interface reported
  a decision as outstanding after it had already been made on the client's behalf.
- ADR-0008 then added `mockup/anatomy.py`, a declared reference span for every `bodyPart`. When
  CONSULT-INV-004 was written there was no anatomical basis for proposing a size. Now there is.

Separately, the interface offers no sense of progress. Measured on the running app at 1440x900
(VERIFIED, 2026-09-22): the preferences panel alone was **1027 px tall in a 900 px viewport**, the
document was 1151 px, and the primary action sat below the fold. `body` had no background image at
all. Below 1024 px the layout collapses to one column and the scrolling gets worse. A first-time
client is shown every field at once, in one undifferentiated column, with nothing saying what is
done or what remains.

## Decision

**1. Size is proposed, not demanded.** The design process derives it from the body zone and the
idea. It is never reported as a missing client answer. The client may override it at any time, and
an explicit value always wins. CONSULT-INV-004 is amended to say so.

**2. The interface states progress explicitly.** A persistent rail names every step, marks those
completed, the one in progress, and those remaining, and says which are optional. It derives its
state entirely from the session the page already holds and owns no rule (WEB-INV-001).

**3. The panel may not outgrow the viewport.** Above 1024 px it is sticky with its own scroll, so
the primary action stays reachable and the page does not grow without bound.

**4. The room has light in it.** Layered warm and cold gradients, fine grain and a vignette,
authored in CSS with an inline SVG noise texture rather than shipped as an image asset.

## Alternatives considered

**Keep asking for the size.** Honest to the old invariant. Rejected: it asks the client for a
number most of them cannot estimate, and the system already has a better answer from the zone.
Demanding it is friction masquerading as rigour.

**Gate the panel so only the current step's fields render.** Would cut the panel's height far more
than sticky scrolling does, and is the natural end state. Deferred: `page.tsx` is 966 lines and
restructuring the form around a step machine is a separate change with real regression risk on a
working app. The rail is designed so that gating can be added behind it later without changing its
contract.

**Ship a photographic background.** A studio photograph would be more atmospheric than gradients.
Rejected for now: it adds a binary asset and a licensing question to a repository that has neither,
for something CSS does adequately.

## Consequences

- A client can complete a design without ever typing a millimetre. The size they receive comes from
  reference anatomy and a model's judgement, both of which can be wrong — so the proposal is shown,
  not hidden, and the field stays editable.
- CONSULT-INV-004 changes meaning. Any future reader of the old text would have been misled about
  what the code does, which is the failure mode the protocol exists to prevent.
- The rail is derived state. If a step's condition drifts from what the panel actually requires,
  the rail will lie confidently. Its conditions are therefore written from the same values the
  panel gates on, not from a parallel notion of readiness.

## Affected specs/modules

`consultation` (CONSULT-INV-004 amended), `web`.

## Validation / revisit conditions

- **Revisit if** clients routinely override the proposed size. That would mean the proposal is bad,
  and the reference spans or the model's guidance need correcting — the measurement ADR-0008 also
  asked for.
- **Revisit if** the rail's five steps stop matching how people actually move through the app; the
  step list is the cheapest thing here to change.
- **This decision is wrong if** proposing a size makes clients trust a number they should have
  questioned. The mitigation is that the figure is always visible and always editable; if that
  proves insufficient, the proposal should become a question again.
