# Tattoo Creator

An application that takes a tattoo idea through a guided consultation and produces two artifacts:
a **studio-grade stencil** a tattooer can print and transfer at 1:1, and a **photorealistic
on-body mockup** on the user's own photograph.

## Read this first

1. `.specanchor/README.md` — the working protocol.
2. `.specanchor/spec-index.md` — every module, its spec, and who enforces which invariant.
3. `.specanchor/project-codemap.md` — intended structure and current state.

## Spec-driven development is mandatory here

For material changes in this project, apply the Spec Anchor protocol in `.specanchor/README.md`.
Use light or full tasks according to impact. Verify affected acceptance criteria and document the
two directional reviews. Report documentary coverage separately from semantic alignment.

Specifically:

- **Load the relevant global and module specs before editing.** Module ownership is in
  `.specanchor/module-map.json`.
- **Contract changes update the module spec before or alongside the code.** The guard enforces it.
- **Never rewrite a spec to legitimize an accidental implementation change.** If code and spec
  disagree, establish the intended behavior first, then correct the right artifact.
- **A guard pass is not proof of correctness.** It checks documentary coverage only.

## Current state

No application code exists. All eleven modules are `draft`, and every behavioral statement in the
specs is `INTENT` rather than `OBSERVED` or `VERIFIED`. Do not describe planned behavior as
existing behavior.

## Evidence discipline

Mark every inferred statement with its status and source:

| Status | Meaning |
|---|---|
| `OBSERVED` | Supported by inspected code or configuration; execution unverified |
| `VERIFIED` | An executed check supports this precise statement; record command and result |
| `INFERRED` | Plausible interpretation requiring confirmation |
| `UNKNOWN` | Insufficient evidence |
| `INTENT` | Desired behavior explicitly requested or accepted |

Do not invent evidence, do not record a test as passing that was not run, and do not fabricate an
approver.

## Hard constraints

These come from the global specs and are not negotiable without an ADR:

- Only `services/worker/generation/` may call an external image model.
- The mockup's AI blend pass may not alter design geometry. The geometric warp is authoritative.
- Stencils are produced by a native line-art pass, never by edge-detecting the shaded render.
- No user photograph is persisted or sent to any provider before passing the safety input gate.
- EXIF is stripped before durable persistence; photos are encrypted at rest.
- Deleting a photo deletes every artifact derived from it.
- Aging and healing outputs are labeled illustrative, never predictive.
- The product does not imitate the style of a named living tattoo artist.

## Conventions

- Code, comments, identifiers, specs and commit messages in English.
- Guard patterns use `fnmatch`: `*` matches slashes. Module globs must not nest.
- Any new top-level source tree must be added to `.specanchor/module-map.json` in the same change.
- `scripts/check-spec-sync.py` is copied verbatim from the `sdd-spec-anchor` skill. Do not edit it.

## Commands

```sh
python scripts/check-spec-sync.py --baseline
python scripts/check-spec-sync.py --review .specanchor/evidence/impact-review.json
```

Project test suites do not exist yet and will be added in TASK-0001.
