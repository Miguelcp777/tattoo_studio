---
type: module-spec
module: platform
status: draft
source_paths:
  - .gitattributes
  - .github/*
  - .npmrc
  - .prettierignore
  - .prettierrc.json
  - CLAUDE.md
  - eslint.config.mjs
  - infra/*
  - package.json
  - pnpm-workspace.yaml
  - scripts/*
  - services/worker/.python-version
  - services/worker/app/*
  - services/worker/pyproject.toml
  - tsconfig.base.json
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
  never reported as functional verification. As of TASK-0002 there are four jobs: `spec-coverage`,
  `typescript`, `python` (a matrix over both Python packages) and `codegen`.
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

- **CI has never executed.** The workflow is structurally valid but unrun; there is no remote. All
  verification to date is local and on Windows, so Linux behavior of every check is unverified.
- The `--review` coverage gate is not automated in CI. Producing an impact review at CI time from
  a task's recorded classification requires tooling that does not exist. CI runs `--baseline`
  only, and review-based coverage is run locally per task. This is a real gap in enforcement.
- Hosting platform and deployment region are undecided. Region has GDPR residency consequences.
- `esbuild` is the one dependency permitted to run an install script, listed individually in
  `pnpm-workspace.yaml` under `allowBuilds`. Approval is recorded per package rather than
  blanket-enabled, and each future addition is a deliberate decision. Note that pnpm rewrites
  this file itself when `approve-builds` runs, normalising quoting and the key name, so
  hand-formatting it does not survive.
- The worker declares only the settings the shell needs. Engine configuration arrives with each
  engine, so that an unset key always means something genuinely missing.
- Prettier and ESLint now carry a growing exclusion list (Next-generated files, generated
  contract artifacts, corpus fixtures, the pnpm-owned workspace file). Each exclusion is
  justified where it is written, but the list is worth revisiting if it keeps growing.
- There are now two independent Python projects with separate lockfiles. A dependency shared
  between them can drift in version without anything noticing.

## Alignment notes

Aligned as of TASK-0001. The manifests, workspace wiring, worker application shell and CI
workflow listed in `source_paths` now exist and are verified locally.

`infra/*` is still declared ahead of the code it will own; no deployment configuration exists.

This module owns root configuration files by exact path rather than by a recursive glob, because
guard patterns use `fnmatch` where `*` matches slashes. Adding a root config file therefore
requires adding it to the module map by name — TASK-0001 hit exactly this, with five unmapped
files caught by `--baseline`.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0001): pnpm workspace, uv-managed worker, FastAPI shell with validated
  settings, GitHub Actions workflow with three independent jobs. Module map extended with five
  root configuration files.
- 2026-09-19 (TASK-0002): `contracts` added to the pnpm workspace and as a uv path dependency of
  the worker. CI grew a Python matrix over both Python packages and a `codegen` job asserting
  generated artifacts match the schema. `.gitattributes` added to normalise line endings, since
  the contracts module asserts two files are byte-identical while development is on Windows and
  CI is on Linux.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Guard installed verbatim and enforcing | VERIFIED | `--baseline` exit 0; planted-file probe exit 1 | PASS |
| Repository on branch `main` | VERIFIED | `git init` 2026-09-19 | PASS |
| Worker installs, lints, typechecks, tests | VERIFIED | `uv sync`, `ruff`, `mypy`, `pytest` all exit 0 | PASS |
| Settings fail loudly and redact values | VERIFIED | `app/tests/test_settings.py`, 6 tests | PASS |
| CI declares four independent jobs | OBSERVED | `ci.yml` parsed; jobs enumerated | PASS |
| CI actually passes | UNKNOWN | Never executed; no remote | NOT_RUN |
| Hosting and region | UNKNOWN | Undecided | NOT_RUN |
