---
type: global-spec
status: draft
last_reviewed: 2026-09-19
---

# Coding Standards

## Purpose

Keep two runtimes (TypeScript and Python) legible as one system, and keep the shared contract
from drifting between them.

## Current behavior with evidence status

No implementation exists. All statements are INTENT.

## Intended behavior

- **TypeScript:** strict mode on, no implicit `any`, ESLint + Prettier, `zod` for runtime
  validation at every boundary.
- **Python:** 3.11+, `ruff` for lint and format, `mypy` in strict mode on the worker, `pydantic`
  v2 for runtime validation at every boundary.
- **Shared schemas:** authored once as JSON Schema under `contracts/`. TypeScript and Python
  validators are derived from it and exercised against one shared fixture corpus so drift fails a
  test rather than reaching production (ARCH-INV-005).
- **Errors:** domain errors are typed and carry a stable machine-readable code. Engines never
  raise raw provider exceptions across a module boundary.
- **Language:** code, comments, identifiers, specs and commit messages in English.

## Constraints

- No module imports another module's internals; only its declared public interface.
- No business logic in `web`. If a rule needs testing without a browser, it belongs elsewhere.
- Image bytes are passed by reference (storage key), not inlined through the queue.

## Invariants

- CODE-INV-001: Every cross-module payload is validated against its contract schema on entry.
- CODE-INV-002: No secret, credential or personal datum is written to logs.
- CODE-INV-003: Public functions crossing a module boundary are typed and annotated in both
  runtimes; `any` and untyped `dict` are not acceptable at a boundary.

## Conventions

- Tests colocate with the module they cover.
- Test names state the behavior asserted, not the function called.
- A test that requires a live external provider is marked and excluded from the default run.

## Non-goals

- A shared ORM or code-generation framework spanning both runtimes.
- 100% coverage as a target. Coverage of invariants matters; coverage of getters does not.

## Evidence / sources

| Statement | Evidence status | Source / revision |
|---|---|---|
| Toolchain choices | INTENT | Planning session 2026-09-19 |
| Single-source-of-truth schema strategy | INTENT | ADR-0004 |

## Unknowns

- Generation mechanism from JSON Schema to `zod` and `pydantic` is unselected (ADR-0004,
  resolved in TASK-0002).

Resolved 2026-09-19 in TASK-0001: the TypeScript workspace uses **pnpm** (12.4.2) and the Python
worker uses **uv** (0.12.17). Both are recorded VERIFIED in `project-setup.spec.md`.

## Change history

- 2026-09-19: Created during SDD bootstrap. Status draft, no implementation.
- 2026-09-19 (TASK-0001): Toolchain unknowns resolved. Lint, format, typecheck and test are
  configured and passing in both runtimes. Prettier is scoped away from `.specanchor/` so that
  reformatting never churns specification diffs.
