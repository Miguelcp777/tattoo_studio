# Specification Index

| Module | Source paths | Persistent spec | Status | Last reviewed |
|---|---|---|---|---|
| contracts | `contracts/*` | `.specanchor/modules/contracts.spec.md` | draft | 2026-09-19 |
| web | `apps/web/*` | `.specanchor/modules/web.spec.md` | draft | 2026-09-19 |
| consultation | `packages/consultation/*` | `.specanchor/modules/consultation.spec.md` | draft | 2026-09-19 |
| generation | `services/worker/generation/*` | `.specanchor/modules/generation.spec.md` | draft | 2026-09-19 |
| flash | `services/worker/flash/*` | `.specanchor/modules/flash.spec.md` | draft | 2026-09-19 |
| stencil | `services/worker/stencil/*` | `.specanchor/modules/stencil.spec.md` | draft | 2026-09-19 |
| mockup | `services/worker/mockup/*` | `.specanchor/modules/mockup.spec.md` | draft | 2026-09-19 |
| media | `services/worker/media/*` | `.specanchor/modules/media.spec.md` | draft | 2026-09-19 |
| safety | `services/worker/safety/*` | `.specanchor/modules/safety.spec.md` | draft | 2026-09-19 |
| jobs | `services/worker/jobs/*` | `.specanchor/modules/jobs.spec.md` | draft | 2026-09-19 |
| platform | root manifests, `scripts/*`, `infra/*`, `.github/*`, `services/worker/app/*` | `.specanchor/modules/platform.spec.md` | draft | 2026-09-19 |

Every module is `draft`. `contracts` is implemented and verified for `TattooBrief` (TASK-0002);
`platform` and `web` have skeletons (TASK-0001); the other eight have no code.

No module is `verified` as a whole. `contracts` comes closest, but its remaining schemas do not
exist and its field set is unproven against any consumer.

## Global specifications

- `.specanchor/global/architecture.spec.md`
- `.specanchor/global/coding-standards.spec.md`
- `.specanchor/global/project-setup.spec.md`
- `.specanchor/global/product-behavior.spec.md`
- `.specanchor/global/quality-and-security.spec.md`

## Tasks

| Task | Title | Status |
|---|---|---|
| TASK-0001 | Repository skeleton, toolchain and CI | verified |
| TASK-0002 | TattooBrief contract and dual-runtime validation | verified |
| TASK-0011 | Record first CI execution and the existence of a remote | verified |

## Decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-0001 | Hosted image models behind a provider adapter | proposed |
| ADR-0002 | Hybrid mockup: geometric warp then constrained AI blend | proposed |
| ADR-0003 | Stencil via native line-art pass and centerline vector trace | proposed |
| ADR-0004 | One JSON Schema as the source of truth for both runtimes | accepted (validated TASK-0002) |
| ADR-0005 | Next.js BFF and Python worker separated by a job queue | proposed |
| ADR-0006 | Privacy posture for body photographs | proposed |

## Invariant ownership

Cross-cutting invariants are declared in the global specs and enforced in named modules:

| Invariant | Declared in | Enforced by |
|---|---|---|
| ARCH-INV-001 sole outbound model call | architecture | generation |
| ARCH-INV-005 schema parity across runtimes | architecture | contracts (VERIFIED, TASK-0002) |
| PROD-INV-001 design geometry preserved in mockup | product-behavior | mockup |
| PROD-INV-002 stencil prints 1:1 | product-behavior | stencil |
| PROD-INV-003 aging is illustrative | product-behavior | mockup, web |
| PROD-INV-004 no living-artist mimicry | product-behavior | safety, consultation, flash |
| SEC-INV-001 no training on user photos | quality-and-security | generation |
| SEC-INV-002 EXIF stripped | quality-and-security | media |
| SEC-INV-004 cascade deletion | quality-and-security | media, safety |
| SEC-INV-006 gates always active | quality-and-security | safety |
| SEC-INV-007 no unscreened photo leaves the system | quality-and-security | safety, media, generation |
