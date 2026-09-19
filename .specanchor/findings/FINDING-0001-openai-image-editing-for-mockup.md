---
type: finding
id: FINDING-0001
created: 2026-09-19
status: open
raised_by: TASK-0004
affects: [mockup, generation]
---

# FINDING-0001: OpenAI's image model offers editing, which the mockup blend needs

## What was noticed

While confirming fal's API surface for TASK-0004, the user asked whether OpenAI could be used
instead. Checking OpenAI's current model catalogue turned up something relevant beyond the
question asked.

OpenAI's flagship model **GPT-6 Astra** (`gpt-6-astra`) takes image input but produces text
output, so it is not a generation option at all. Image generation is a separate family:

- **GPT-Image-2.5 Sunburst** — "our most capable model for image generation **and editing**"
- **GPT-Image-2.5 Flare** — fast, high-volume generation

Source: OpenAI model catalogue, read 2026-09-19. Evidence status: OBSERVED.

## Why it matters

ADR-0002 commits the mockup to a hybrid pipeline: a deterministic geometric warp that is
authoritative for design shape, followed by a **constrained AI pass that integrates the warped
design into skin without altering its geometry**. That second stage is an image *editing*
operation, not a generation from scratch.

A model whose editing behaviour is strong and controllable directly affects whether ADR-0002
survives its validation condition — the geometry tolerance in TASK-0008. If no available editor
can blend without redrawing, ADR-0002 falls back to geometric-only.

So this is not a preference between vendors. It is a candidate for the single riskiest decision
in the project.

## What is not yet known

- Whether Sunburst's editing preserves source geometry within any usable tolerance. **Untested.**
  This is the whole question and nothing here answers it.
- Pricing for either image model. Not confirmed; the pricing page was not located.
- Its content policy on photographs of real people's bodies. OpenAI is generally restrictive
  here, and the mockup path sends exactly that kind of image (SEC-INV-007 territory). A model
  that refuses torso photographs is unusable for this product regardless of blend quality.
- Whether its data-handling terms satisfy SEC-INV-001 (no training, no retention on user photos).

## Suggested handling

Do not act on this now. TASK-0004 and TASK-0005 concern flash and line art, where fal plus Flux
is the better fit for clean linework at low cost.

Take it up in **TASK-0008**, the mockup spike, which already exists to compare approaches on a
fixed photo corpus. Add GPT-Image-2.5 Sunburst as a candidate blender there and measure it
against the geometry tolerance like any other.

The provider adapter makes this cheap: different passes may use different providers, which is
likely the right shape anyway. Nothing about choosing fal now forecloses it.

## Out-of-scope note

The same catalogue lookup showed Astra is a reasoning model with a large context window. That is
potentially relevant to the consultation module (TASK-0003), whose spec currently names Claude.
Not pursued here, and not a reason to revisit that choice without a concrete problem.
