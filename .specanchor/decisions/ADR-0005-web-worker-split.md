---
type: adr
status: proposed
id: ADR-0005
created: 2026-09-19
---

# ADR-0005: Next.js BFF and Python worker, separated by a job queue

## Context

The system has two workloads with nothing in common. One is an interactive web experience:
conversation, galleries, a placement editor. The other is image processing: depth estimation,
geometric warping, vector tracing, and calls to hosted models that take seconds to minutes.

The imaging ecosystem is Python's — OpenCV, Pillow, depth and segmentation models, tracing
bindings. The UI ecosystem is TypeScript's. Forcing either workload into the other's language
means reimplementing or shimming mature tooling.

Separately, generation latency makes synchronous request handling untenable. A request that blocks
for two minutes fails to platform timeouts, cannot report progress, cannot be cancelled, and
retries as duplicate billable work.

## Decision

Two runtimes with one boundary:

- **`apps/web`** (Next.js, TypeScript) — UI and backend-for-frontend. No domain logic.
- **`packages/consultation`** (TypeScript) — the brief state machine, colocated with the web
  runtime because it is interactive and synchronous.
- **`services/worker`** (FastAPI, Python) — all engines and cross-cutting services.

They communicate only through the job queue and the shared contract schemas. No shared database
access, no direct imports.

**No generation happens on a request path.** Web enqueues a job and returns a `JobRef`
immediately; the UI polls or subscribes for completion. Payloads carry `ImageRef` handles, never
image bytes.

The consultation is the single deliberate exception to asynchrony: it is a conversation and must
feel like one, so it calls the Claude API synchronously within a request.

## Alternatives considered

- **All-Python, server-rendered or Gradio.** One language, fastest to a prototype. Rejected: the
  placement editor and consultation UI need a real frontend, and Gradio-class tooling would be
  discarded before launch.
- **All-TypeScript with `sharp` and WASM ports.** One language and simple serverless deploy.
  Rejected: centerline tracing, depth estimation and segmentation have no comparable TypeScript
  story, and this is precisely the work that determines output quality.
- **Synchronous generation with long timeouts.** Rejected: no progress reporting, no cancellation,
  duplicate work on retry, and it breaks under ordinary platform limits.
- **A single process serving both.** Rejected: CPU-bound imaging starves the interactive path.

## Consequences

- Two toolchains, two dependency managers, two test suites, two deploy targets. Real overhead,
  accepted deliberately.
- The contract boundary must be enforced mechanically, which is what ADR-0004 provides.
- Asynchrony is visible in the product: every generation shows progress and can be cancelled. This
  is a better experience than a spinner, but it is more UI to build.
- The queue backend becomes infrastructure the project must operate. It is not yet chosen.

## Affected specs/modules

`web`, `consultation`, `jobs` (owner of the boundary), `platform`, `architecture`.

## Validation / revisit conditions

Validated in TASK-0006, which must show a job surviving enqueue, execution, status reporting,
cancellation and redelivery without duplicating a billable generation call.

Revisit if operational overhead of two runtimes outweighs the ecosystem benefit — most plausibly
if the imaging work turns out to be thinner than expected, for example if tracing and compositing
end up largely delegated to hosted services.
