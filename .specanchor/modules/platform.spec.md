---
type: module-spec
module: platform
status: draft
source_paths:
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - CLAUDE.md
  - scripts/*
  - infra/*
  - .github/*
  - services/worker/app/*
  - services/worker/pyproject.toml
last_reviewed: 2026-09-19
---

# Module: platform

## Responsibility

Everything that holds the system up rather than being part of it: manifests, workspace wiring, the
worker application shell, configuration, CI, deployment, and the Spec Anchor tooling.

## Source ownership

Root manifests, `scripts/`, `infra/`, `.github/`, `services/worker/app/`, and the project
`CLAUDE.md`.

Note: this module owns files by exact path at the repository root rather than by a recursive glob,
because guard patterns use `fnmatch` where `*` matches slashes. A recursive pattern here would
claim files belonging to other modules.

## Public interfaces

- The worker application entrypoint and its dependency wiring
- Typed settings loaded from environment configuration
- `scripts/check-spec-sync.py`, the documentary coverage guard
- CI workflow definitions

## Inputs and outputs

Inputs: environment configuration. Outputs: a running worker process and CI verdicts.

## Domain invariants

- PLAT-INV-001: `scripts/check-spec-sync.py` is not modified locally. Guard changes come from
  upgrading the `sdd-spec-anchor` skill (SETUP-INV-002).
- PLAT-INV-002: Any new top-level source tree is added to `.specanchor/module-map.json` in the
  same change that introduces it (SETUP-INV-001).
- PLAT-INV-003: Secrets are read from environment configuration and never committed. No spec,
  evidence file or log records a secret value.
- PLAT-INV-004: CI runs the guard and the project test suites as separate checks. A guard pass is
  never reported as functional verification.
- PLAT-INV-005: Settings are validated at process start. A missing or malformed required setting
  fails startup loudly rather than defaulting.

## Data / persistence

None.

## Dependencies

None at runtime; every other module depends on this one structurally.

## External integrations

CI provider and hosting platform, both undecided.

## Error semantics

Configuration errors fail fast at startup with the offending key named and its value redacted.

## Security and permissions

Dependency and secret scanning run in CI. Deployment credentials live in the CI provider's secret
store, never in the repository.

## Observability

Build and deploy outcomes, guard pass rate, test suite duration, dependency vulnerability counts.

## Performance / operational constraints

CI must stay fast enough to run on every push. The guard itself is near-instant; the test suites
dominate.

## Tests / verification

Settings validation is unit-tested including the failure paths. The guard is exercised in CI on
every change. The skill's own regression suite can be run from the skill folder against temporary
repositories without touching this one.

## Known uncertainties and debt

- CI provider, hosting platform and deployment region are undecided. The region choice has GDPR
  data-residency consequences (see quality-and-security spec).
- TypeScript package manager is unfixed; `pnpm-workspace.yaml` in the module map is provisional
  and must be corrected if npm is chosen.
- Python dependency manager is undecided.

## Alignment notes

The repository currently contains only specifications, the guard and its configuration. The
manifests and application shell listed in `source_paths` do not exist yet; those paths are
declared ahead of the code they will own, so that the first commit introducing them is already
anchored.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Guard installed verbatim | OBSERVED | `scripts/check-spec-sync.py` 2026-09-19 | NOT_RUN |
| Repository on branch `main` | VERIFIED | `git init` 2026-09-19 | PASS |
| Manifests and app shell not yet present | OBSERVED | Directory listing 2026-09-19 | NOT_RUN |
| CI provider and hosting | UNKNOWN | Undecided | NOT_RUN |
