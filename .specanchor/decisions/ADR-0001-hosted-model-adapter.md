---
type: adr
status: proposed
id: ADR-0001
created: 2026-09-19
---

# ADR-0001: Hosted image models behind a provider adapter

## Context

The system needs three kinds of image generation: a shaded flash render, a clean line-art pass,
and a constrained blend pass for the mockup. The original proposal specified self-hosted SDXL or
Flux fine-tuned with a LoRA.

Self-hosting has two costs the project cannot absorb at this stage. First, GPU infrastructure and
its operational burden. Second, and more seriously, training a tattoo-style LoRA requires a corpus
of tattoo artwork, and tattoo art is authored work whose reproduction is a live grievance in that
community. Assembling a legally and ethically clean corpus is a project of its own.

Model quality in this space also moves faster than the application will. Committing the
architecture to one model is committing to whatever was best on the day the decision was made.

## Decision

Use hosted image-model APIs, reached exclusively through a `GenerationProvider` adapter in
`services/worker/generation/`.

The adapter exposes `text_to_image`, `image_to_image` and `inpaint`, returning an `ImageRef`
rather than bytes. Provider selection is configuration, not a caller concern. A provider
conformance suite defines what any adapter must satisfy.

Providers that do not offer a no-training and no-retention guarantee are ineligible, because user
photographs pass through the mockup blend path (SEC-INV-001).

## Alternatives considered

- **Self-hosted SDXL or Flux with a custom LoRA.** Best style fidelity and lowest marginal cost at
  volume. Rejected for v0 on infrastructure burden and the dataset-licensing obstacle. The adapter
  keeps this reachable later: a self-hosted provider is just another adapter implementation.
- **A single hosted provider called directly.** Less code today. Rejected because it spreads an
  external dependency across three engines and makes model migration a cross-module change.
- **Hosted for artwork, self-hosted for compositing.** Partially adopted: depth and segmentation
  for the mockup do run locally, but those are not generative models and do not go through this
  adapter.

## Consequences

- Per-image cost replaces fixed infrastructure cost. Cost ceilings must be defined; they are not
  yet.
- Model choice stays reversible; provider outage becomes an availability risk to be handled in
  `generation` with typed errors and bounded retries.
- Style fidelity without a LoRA is unproven and is the main quality risk of the project. It is
  recorded as UNKNOWN in the `flash` and `stencil` specs.
- Eligibility screening of providers becomes a recurring obligation, not a one-time check.

## Affected specs/modules

`generation` (owner), `flash`, `stencil`, `mockup`, `architecture`, `quality-and-security`.

## Validation / revisit conditions

Revisit if any of the following hold:

- Hosted models cannot reach acceptable style fidelity or line-art cleanliness (measured in
  TASK-0004 and TASK-0005).
- Per-image cost at projected volume exceeds the self-hosting break-even.
- No eligible provider offers an adequate no-training guarantee.
- A legally clean training corpus becomes available, making a LoRA viable.
