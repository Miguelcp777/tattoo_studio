---
type: adr
status: proposed
id: ADR-0015
created: 2026-09-26
---

# ADR-0015: Two-tier agent orchestration — interactive TS triad and a worker LangGraph pipeline

## Context

The product is naturally a set of cooperating agents:

1. A **prompt architect** that turns a vague idea into a detailed, generation-ready brief.
2. A **visual scout** that finds reference imagery when the client supplied none, or when the
   ones supplied are insufficient.
3. A **visual creator** that turns the accepted brief, the scouted references and the client's own
   references into the two deliverables: the on-body mockup and the thermal stencil.

An **orchestrator** must sequence these effectively.

The repository already contains this shape in `packages/consultation/src/agents/`
(`orchestrator.ts`, `master-prompt.ts`, `image-scout.ts`, `researcher.ts`, `creator.ts`). Today the
scout and the architect are deterministic (regex extraction, Wikimedia Commons queries), and
`creator.ts` deliberately throws because image generation is confined to the Python worker
(ARCH-INV-001). This ADR records how those agents become model-backed and how the creation
pipeline is orchestrated, without weakening any existing boundary.

Two hard structural facts shape the decision:

- **The consultation is interactive and synchronous; generation is asynchronous through `jobs`.**
  The architecture spec forbids synchronous image generation on a request path. A single runtime
  orchestrating all four agents end to end would either block a request on a queued job or move the
  conversation off the request path. Neither is wanted.
- **ARCH-INV-001 confines outbound model egress in the worker to `generation` (image) and `safety`
  (moderation).** A reasoning-LLM call added anywhere else in the worker would be a new egress
  point the architectural test forbids.

## Decision

Orchestrate in **two tiers**, matching the existing sync/async split.

**Tier 1 — interactive triad, in `packages/consultation/` (TypeScript).**
The existing `OrchestratorAgent` keeps coordinating the conversation. Its sub-agents become
model-backed through the existing `ConsultationProvider` seam:

- **Prompt architect** (`agents/master-prompt.ts` + provider) runs on **Claude Opus 5.5**. It reads
  the accumulated slots and reference analysis and produces the master brief the client accepts
  (ADR-0013) and the technical generation prompt the worker will consume. It never calls an image
  model and never generates imagery (CONSULT-INV-001).
- **Visual scout** (`agents/image-scout.ts`) runs on **Claude Sonnet 5**, which decides the search
  queries. Retrieval keeps the current provenance-first behaviour: licensed sources
  (Wikimedia Commons) are searched first; an **open-web image search is a bounded fallback** used
  only when licensed sources return nothing, and every candidate is passed through `safety`'s
  content screen so real-person and non-compliant images are rejected before they can become
  references. A scouted candidate is never `user_supplied`.

Claude joins OpenAI GPT-6 Astra as an approved `consultation` reasoning backend (already permitted
by the consultation spec); the provider is selected by configuration, not by caller.

**Tier 2 — generation pipeline, in a new `orchestration` module in the worker (Python + LangGraph).**
`services/worker/orchestration/` hosts a LangGraph graph that sequences the creation of the two
deliverables inside a `jobs` job. It is the concrete implementation of the "visual creator" agent.
It refactors the sequencing currently inlined in `app/studio.py::Studio.generate` into named graph
nodes so each step is inspectable, retryable and independently testable:

```
brief + finalized prompt (from Tier 1)
   -> master_artwork        (generation: flat line-art / colour; no body photo in)
   -> stencil_trace         (stencil: native centerline vector; unchanged, ADR-0003)
   -> surface_estimate      (mockup: local depth/normals/mask)
   -> geometric_warp        (mockup: authoritative design shape)
   -> ai_blend              (mockup -> generation: constrained skin integration; ADR-0016)
   -> geometry_check        (mockup: reject if beyond tolerance; MOCKUP-INV-002)
   -> output_gate           (safety: screen generated imagery)
   -> assemble_result       (media: store artifacts with derivation lineage)
```

> **Amended by TASK-0052 (2026-09-29).** A `skin_plate` node now leads the graph: the plate — own
> photo, parent plate, or a new one from a text-only prompt — is settled before `master_artwork`.
> BFL's EU cluster timed out a plate that day after the artwork had been paid for, and the artwork
> was discarded. Failing first costs the plate and nothing else. The constraints this ADR sets on
> the rest of the order are unchanged.

The `orchestration` module introduces **no new outbound egress**: it calls image models only
through `generation` and moderation only through `safety`. All reasoning-LLM calls stay in Tier 1.
`app/studio.py` becomes a thin entrypoint that builds the graph and invokes it.

**Image vendor per pass.** Master artwork may use Flux (via fal / BFL) or GPT-Image, selected per
pass by configuration through the existing `generation` registry (ADR-0009). The **blend pass**
provider is fixed by the TASK-0008 spike and constrained by ADR-0006/ADR-0016 (see that ADR).

## Alternatives considered

- **One orchestrator over all four agents in a single runtime.** Rejected: it collapses the
  sync/async boundary the architecture spec draws, and forces either a blocked request or a
  conversation off the request path.
- **LangGraph.js in the consultation package.** Rejected for the pipeline: the creation work is
  Python (imaging, the worker engines), and LangGraph.js is less mature. The interactive triad does
  not need a graph framework; its coordination is already a small state machine.
- **Keep the scout and architect deterministic.** Rejected: regex extraction cannot read a
  reference image or reason about an ambiguous idea, which is the whole point of these agents.
- **Put the graph in `app/studio.py` (platform).** Rejected: the creation pipeline is domain logic
  with its own invariants and test obligations; it earns a module and a spec rather than living in
  the composition root.

## Consequences

- A new worker module (`orchestration`) with its own spec and a `module-map.json` entry, added in
  the same change (repo convention).
- The interactive triad gains a real model dependency and its latency/cost; the fixture provider
  remains the offline/CI path.
- `Studio.generate`'s sequencing moves into graph nodes. This is a refactor with behaviour parity
  as its bar, verified against the existing studio tests before any blend behaviour is added.
- Two reasoning backends (OpenAI Astra, Claude) must be kept behind one provider interface.
- LangGraph becomes a worker dependency; it must not become a second, competing notion of a job.
  The graph runs *inside* one `jobs` job; `jobs` remains the only job abstraction.

## Affected specs/modules

`orchestration` (new, owner), `consultation`, `generation`, `mockup`, `architecture` (new pipeline
node and an ARCH-INV-001 clarification), `platform` (`app/studio.py` entrypoint).

## Validation / revisit conditions

- The node refactor of `Studio.generate` must preserve current outputs on the existing studio test
  corpus before any new behaviour lands (behaviour-preserving step).
- The architectural egress test must still pass with `orchestration` present: it asserts the worker
  HTTP client lives only in `generation` and `safety`, and `orchestration` must not add one.
- Revisit if a generation-time scout is ever required (it would need worker egress and a matching
  ARCH-INV-001 amendment, not a silent addition).
