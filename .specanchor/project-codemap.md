# Project Codemap

Status as of 2026-09-19: **no application code exists.** This codemap describes the intended
structure agreed during planning, so that the first code to land is already anchored. Sections
describing runtime behavior are INTENT, not OBSERVED.

## Runtime / stack

- TypeScript on Node 22 for `apps/web` and `packages/consultation` (Next.js). INTENT.
- Python 3.11+ (FastAPI) for `services/worker`. INTENT.
  Development machine currently has Python 3.13.5, Node 22.16.0, Git 2.51.0. VERIFIED 2026-09-19.
- The two runtimes communicate only through the job queue and shared contract schemas.

## Entry points

| Entry point | Path | Status |
|---|---|---|
| Web application | `apps/web` | not created |
| Worker service | `services/worker/app` | not created |
| Coverage guard | `scripts/check-spec-sync.py` | present |

## Main modules

| Module | Responsibility | Primary paths | Dependencies |
|---|---|---|---|
| contracts | Shared schemas; owns `TattooBrief` | `contracts/*` | none |
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

Not yet established. Documentary coverage today:

```
python scripts/check-spec-sync.py --baseline
python scripts/check-spec-sync.py --review .specanchor/evidence/impact-review.json
python scripts/check-spec-sync.py --base origin/main --review .specanchor/evidence/impact-review.json
```

## Cross-cutting concerns

- Privacy and moderation, owned by `safety` and `media`, touch every photo-handling path.
- Asynchrony, owned by `jobs`, touches every engine.
- Contract validation at every boundary, owned by `contracts`.

## Unanchored or uncertain areas

- Nothing is unanchored: `--baseline` reports an empty unmapped list.
- Every module is `draft` with no implementation, so all behavioral statements are INTENT.
- The largest open technical risk is ADR-0002 (mockup blending), pending the TASK-0008 spike.
- The largest open non-technical risk is the absence of legal review for body-photo processing.
