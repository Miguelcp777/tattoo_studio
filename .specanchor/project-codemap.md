# Project Codemap

Status as of 2026-09-19, after TASK-0002: **the central contract exists; no engine does.**
`TattooBrief` is defined once and validated identically in both runtimes, with 81 tests passing
across four packages. There are still no engines, no queue, no storage, no moderation and no
product surfaces. Sections describing engine behavior remain INTENT.

## Runtime / stack

- TypeScript on Node 22 for `apps/web` (Next.js 15.5.25), managed by pnpm 12.4.2. VERIFIED.
  `packages/consultation` does not exist yet. INTENT.
- Python (FastAPI) for `services/worker`, managed by uv 0.12.17. VERIFIED.
  Development machine has Python 3.13.5, Node 22.16.0, Git 2.51.0. VERIFIED 2026-09-19.
- The two runtimes communicate only through the job queue and shared contract schemas.

## Entry points

| Entry point | Path | Status |
|---|---|---|
| Contracts | `contracts/` | `TattooBrief` 1.0.0, both runtimes, verified |
| Web application | `apps/web` | shell only; builds, one placeholder route |
| Worker service | `services/worker/app` | shell only; `/health`, validated settings |
| Coverage guard | `scripts/check-spec-sync.py` | present and verified enforcing |
| CI | `.github/workflows/ci.yml` | present; **never executed**, no remote |

## Main modules

| Module | Responsibility | Primary paths | Dependencies |
|---|---|---|---|
| contracts | Shared schemas; owns `TattooBrief` | `contracts/*` | none — implemented |
| web | UI and BFF | `apps/web/*` | contracts, consultation |
| consultation | Brief-building state machine | `packages/consultation/*` | contracts, safety |
| generation | Sole adapter to hosted image models | `services/worker/generation/*` | contracts, media, safety |
| flash | Shaded reference render | `services/worker/flash/*` | contracts, generation, media, safety, jobs |
| stencil | Line art, vector trace, 1:1 export | `services/worker/stencil/*` | contracts, generation, media, jobs |
| mockup | Warp, blend, aging illustration | `services/worker/mockup/*` | contracts, generation, media, safety, jobs |
| media | Asset lifecycle and deletion | `services/worker/media/*` | contracts, safety |
| safety | Consent, moderation, policy gates | `services/worker/safety/*` | contracts, media |
| jobs | Async execution and quotas | `services/worker/jobs/*` | contracts |
| platform | Manifests, app shell, CI, tooling | root, `scripts/*`, `infra/*`, `.github/*`, `services/worker/app/*` | none |

## Data stores

Undecided. Required: a relational store for briefs, designs, jobs and consent records, and object
storage for image assets. Data residency is an open GDPR-relevant question.

## External integrations

| Integration | Purpose | Status |
|---|---|---|
| Hosted image models | Flash, line art, mockup blend | provider undecided (ADR-0001) |
| Claude API | Consultation extraction | `claude-opus-5`, `claude-sonnet-5` |
| Content moderation | Input and output gates | provider undecided |
| Depth / segmentation models | Surface estimation, run locally | candidates only |
| Object storage | Image assets | undecided |
| Queue backend | Async jobs | undecided |

## Authentication / authorization

Undecided. Requirements known: per-user ownership of designs, photos and jobs; authorization
checks on every media resolution; age affirmation before upload.

## Build / test / deploy

Build and test are established; deploy is not.

```
# TypeScript, from the repository root (covers apps/web and contracts)
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build

# Python: run in BOTH contracts/python and services/worker
uv sync && uv run ruff check . && uv run ruff format --check . && uv run mypy . && uv run pytest

# Generated artifacts match the schema
pnpm --filter @tattoo/contracts generate
(cd contracts/python && uv run python scripts/generate.py)
git diff --quiet   # must be clean

# Documentary coverage
python scripts/check-spec-sync.py --baseline
python scripts/check-spec-sync.py --base HEAD~1 --review .specanchor/evidence/impact-review.json
```

No deployment configuration exists. `infra/` is declared in the module map but empty.

## Cross-cutting concerns

- Privacy and moderation, owned by `safety` and `media`, touch every photo-handling path.
- Asynchrony, owned by `jobs`, touches every engine.
- Contract validation at every boundary, owned by `contracts`.

## Unanchored or uncertain areas

- Nothing is unanchored: `--baseline` reports an empty unmapped list over 76 material files.
- Every module is `draft`. Only `contracts`, `platform` and `web` have any code.
- The `TattooBrief` field set is unproven: no consumer reads a brief yet, so whether these are the
  right fields is untested. Expect revisions once an engine renders from one.
- CI has never run, and all verification so far was performed on Windows, so the Linux behavior
  of every check is unverified.
- The largest open technical risk is ADR-0002 (mockup blending), pending the TASK-0008 spike.
- The largest open non-technical risk is the absence of legal review for body-photo processing.
