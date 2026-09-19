---
type: global-spec
status: draft
last_reviewed: 2026-09-19
---

# Project Setup

## Purpose

Describe how the repository is laid out, how it is run locally, and how changes are verified.

## Current behavior with evidence status

- The repository is a Git repository on branch `main`. Evidence status: VERIFIED
  (`git init`, `git symbolic-ref HEAD refs/heads/main`, 2026-09-19).
- Toolchain present on the development machine: Git 2.51.0, Python 3.13.5, Node 22.16.0.
  Evidence status: VERIFIED (`git --version`, `python --version`, `node --version`, 2026-09-19).
- The Spec Anchor guard is installed at `scripts/check-spec-sync.py`, copied verbatim from the
  `sdd-spec-anchor` skill. Evidence status: OBSERVED (file copied 2026-09-19; not yet executed
  against this repository at time of writing).
- No application code, manifests or CI configuration exist yet. Evidence status: OBSERVED.

## Intended behavior

Planned layout:

```
contracts/              shared JSON Schemas and fixtures
apps/web/               Next.js UI and BFF
packages/consultation/  brief-building state machine
services/worker/
  app/                  FastAPI entrypoint, settings, DI wiring
  generation/           provider adapter over hosted image models
  flash/  stencil/  mockup/
  media/  safety/  jobs/
scripts/                repository tooling, including the guard
infra/                  deployment configuration
.specanchor/            specifications, decisions, tasks, evidence
```

Any new top-level source tree must be added to `.specanchor/module-map.json` in the same change.

## Constraints

- The guard requires Python 3.10+, Git, and at least one commit.
- `anchor.yaml` is JSON despite its extension, must be version 2, and must carry exactly the keys
  `version`, `spec_root`, `module_map`, `material_paths`, `exclude_paths`. Unknown keys fail.
- Guard path patterns use Python `fnmatch`, where `*` matches slashes and `**` has no special
  meaning. Module globs must therefore not nest, or a file acquires two owners.

## Invariants

- SETUP-INV-001: Every material file is owned by exactly one module in the map. `--baseline`
  reports an empty `unmapped` list.
- SETUP-INV-002: `scripts/check-spec-sync.py` is not modified locally. Guard behavior changes come
  from upgrading the skill.

## Conventions

Documentary coverage:

```sh
python scripts/check-spec-sync.py --review .specanchor/evidence/impact-review.json
python scripts/check-spec-sync.py --base origin/main --review .specanchor/evidence/impact-review.json
python scripts/check-spec-sync.py --baseline
```

The guard proves documentary coverage only. It cannot produce a semantic verdict, so every task
additionally records a Spec to Code and a Code to Spec review.

## Non-goals

- Monorepo build orchestration (Nx, Turborepo) in v0.
- Containerized local development in v0.

## Evidence / sources

| Statement | Evidence status | Source / revision |
|---|---|---|
| Git repository on `main` | VERIFIED | `git init` 2026-09-19 |
| Toolchain versions | VERIFIED | Version commands 2026-09-19 |
| Guard copied verbatim | OBSERVED | `scripts/check-spec-sync.py` 2026-09-19 |
| Planned directory layout | INTENT | Planning session 2026-09-19 |

## Unknowns

- CI provider is undecided; the module map anticipates `.github/*`.
- Target deployment platform is undecided.

## Change history

- 2026-09-19: Created during SDD bootstrap.
