---
type: finding
id: FINDING-0003
created: 2026-09-19
status: open
raised_by: TASK-0012
affects: [media, safety, generation, architecture]
---

# FINDING-0003: `media` and `safety` declare a circular dependency

## What was noticed

`media.spec.md` lists its dependencies as `contracts`, `safety`.
`safety.spec.md` lists its dependencies as `contracts`, `media`.

Each depends on the other. The cycle went unnoticed through the bootstrap and four tasks because
neither module existed, so nothing ever had to resolve it. Building `media` forces the issue.

Evidence status: OBSERVED (both spec files, 2026-09-19).

## Why each was written that way

The reasoning behind each half is sound in isolation:

- `media` depends on `safety` because MEDIA-INV-003 says `ingest_photo` refuses to persist before
  the safety input gate has passed. To enforce that, it must be able to recognise a gate result.
- `safety` depends on `media` because it was imagined screening *stored* images — the gate looking
  at something that already exists in storage.

The second is the mistaken one, and SEC-INV-007 says why: *no photo is persisted or sent to a
provider before passing the input gate*. If the gate runs before storage, then at the moment
`safety` does its work there is nothing in `media` to look at. It screens **bytes**, not stored
assets.

So the dependency is not merely circular, it contradicts the invariant it exists to serve.

## Resolution taken in TASK-0012

Break the cycle by making the direction match the actual order of operations:

```
  bytes -> safety.screen_upload(bytes) -> SafetyClearance -> media.ingest(bytes, clearance)
```

- `safety` depends on `contracts` only. It receives bytes and returns a verdict.
- `media` depends on `safety`, for the clearance type it must demand.
- `generation` already depends on `safety`, which is now where the clearance type lives.

`SafetyClearance` moves from `generation/types.py` to the `safety` module. It was placed in
`generation` in TASK-0004 only because `safety` did not exist; `safety` is its proper home, since
that module is the only thing that may ever mint one.

## Spec changes required

- `safety.spec.md`: dependencies become `contracts` alone. Its interface is restated in terms of
  bytes rather than stored assets.
- `media.spec.md`: unchanged in direction, but `ingest_photo`'s signature takes a clearance rather
  than a `consent_ref`, since the clearance is what actually evidences the gate having passed.
- `architecture.spec.md`: the module graph is acyclic; worth stating as an invariant so the next
  cycle is caught by review rather than by an implementation stalling on it.

## Worth noting for later

Nothing checks that the declared dependency graph is acyclic, and nothing checks that a module's
*declared* dependencies match its *actual* imports. The architectural tests added in TASK-0004
check specific forbidden edges (`flash` must not import `media`) but not the graph as a whole.

A general test — parse each module spec's dependency list, compare against real imports, and
assert the graph has no cycles — would have caught this at bootstrap. That is a worthwhile
addition, and larger than TASK-0012's scope.
