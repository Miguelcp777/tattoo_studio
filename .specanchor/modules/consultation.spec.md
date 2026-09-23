---
type: module-spec
module: consultation
status: draft
source_paths:
  - packages/consultation/*
last_reviewed: 2026-09-19
---

# Module: consultation

TASK-0030: a catalogue reference's `label` is the Spanish style and variant name. TASK-0028 put
the English prompt text there, which the interface then showed to the client.

TASK-0029 (ADR-0013): `agents/master-prompt.ts` projects the brief a client accepts from the same
slots and references that are sent for generation, so it cannot drift from what is actually made.
It marks studio decisions as proposals — a size exactly filling the zone span, the technical
linework weight — and names what is still missing rather than presenting an incomplete brief as
ready. Exported on the `./master-prompt` subpath so a client bundle can use it without pulling the
orchestrator.

TASK-0028 (ADR-0012): `agents/style-library.ts` turns a style into three catalogue offers and a
chosen offer into a `ReferenceImage` marked `style_library` — never `user_supplied`, because it
is an illustrative render the studio generated rather than the client's own material. Exported
on the `./style-library` subpath so a client bundle can import it without pulling the
orchestrator, which drags `node:crypto` through the build.

TASK-0027 (ADR-0011): free-text extraction recognises the six added styles, and a qualitative
size (`grande`, `mediano`, `pequeño` and their variants) resolves to millimetres as a fraction
of the named zone, read from the shared contract. No size is proposed when the zone is unknown,
because it would be a guess about a body part the client has not named. An explicit measurement
always wins.

TASK-0026 (ADR-0010): size is no longer pushed into `missingFields`. The provider prompt already
recommends a size per anatomy, and `missingPreferences` never gated on it, so reporting it as
outstanding asked the client to settle a decision that had already been taken for them.

TASK-0020/REQ-001: retrieve Valencia CF's live official navigation crest with provenance,
fall back to filtered Commons queries, isolate per-entity failures, and allow a bounded
retry of missing references preserving the initial subject and existing references.

## Responsibility

Act as an experienced tattoo artist taking a brief. Turn a vague idea into a complete, validated
`TattooBrief` by asking targeted questions. It produces a contract, not a conversation transcript.

## Source ownership

`packages/consultation/`

## Public interfaces

- `start(idea, reference_images?) -> ConsultationState`
- `advance(state, user_message, reference_images?) -> ConsultationState` — a state machine step
- `brief(state) -> TattooBrief | Incomplete` — returns a brief only when every required slot is
  filled and valid

## Inputs and outputs

Input: free-text user messages and optional reference images (sketches, photo references, motifs).
Output: a progressively filled brief plus the next question to ask.

## Domain invariants

- CONSULT-INV-001: This module never generates imagery. It only produces briefs (ARCH-INV-001).
- CONSULT-INV-002: A brief is emitted only when it validates against `tattoo-brief.schema.json`.
  Partial briefs are explicitly typed as incomplete.
- CONSULT-INV-003: Free-text style input is mapped onto the closed curated vocabulary. Unmapped
  styles prompt a clarifying question rather than passing through raw.
- CONSULT-INV-004: Size is captured in millimetres. The design process proposes it from the body
  zone and the idea rather than demanding it, and it is never reported as a missing client answer
  (ADR-0010). An explicit client value always wins, and the proposal is shown rather than applied
  silently. Amended by TASK-0026: the original text required asking explicitly, which contradicted
  the shipped provider prompt and predated the reference anatomy ADR-0008 introduced.
- CONSULT-INV-005: A request to imitate a named living artist is declined in-conversation with an
  explanation, and the brief is steered to the underlying style instead (PROD-INV-004).

## Data / persistence

Consultation state persists per session so a user can resume. Transcripts follow the brief
retention lifecycle, not the photo lifecycle.

## Dependencies

`contracts`, `safety`.

## External integrations

OpenAI API targeting **GPT-6 Astra** (`gpt-6-astra`) for multimodal reasoning, reference image
analysis, and structured tool extraction. Alternatively Claude API (`claude-opus-5`, `claude-sonnet-5`).
Structured output via tool calling so extraction returns typed slot data rather than parsed prose.

## Error semantics

Typed errors for: model unavailable, extraction produced invalid data, policy refusal. An
extraction that fails validation retries once with the validation error as feedback, then
surfaces a clarifying question rather than guessing.

## Security and permissions

Reference images (motifs, existing artwork references, sketches) are accepted for style and motif
analysis. In accordance with SEC-INV-007, personal body photographs for mockup placement are
handled by the safety module and do not enter the consultation prompt directly.

## Observability

Turns to a complete brief, slot-fill rates, clarification loops per slot, decline counts by
reason. A slot needing many clarifications indicates a badly worded question.

## Performance / operational constraints

Interactive and synchronous. Each turn must feel conversational, which bounds model latency
choices. This is the one path in the system not routed through `jobs`.

## Tests / verification

The state machine is tested deterministically with recorded model responses (fixture provider). A scripted corpus of
idea-to-brief conversations asserts that each reaches a valid brief. Style mapping is tested
against a labeled fixture set including adversarial artist-name requests.

## Known uncertainties and debt

- The question set and its ordering are designed in TASK-0003.
- How many turns users tolerate before abandoning is unknown.
- Offline fixture provider covers CI test execution.

## Alignment notes

Implementation initiated in TASK-0003.

## Change history

- 2026-09-19: Created during SDD bootstrap.
- 2026-09-19 (TASK-0003): Added OpenAI GPT-6 Astra integration and multimodal reference image support.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Typed state machine, not an agent framework | INTENT | TASK-0003 spec | NOT_RUN |
| OpenAI GPT-6 Astra tool-use structured extraction | INTENT | TASK-0003 spec | NOT_RUN |
| Question set design | INFERRED | TASK-0003 implementation | NOT_RUN |

## TASK-0019 current implementation and remaining intent

Active OrchestratorAgent uses cumulative explicit slot extraction, at most three questions, and the canonical TattooBrief validator. Commons search returns candidates with query, source and licence; missing entity references block readiness. The legacy fixture state machine remains test/legacy code, not the active web route. General-language extraction beyond the supported vocabulary remains limited.

Evidence: `.specanchor/evidence/TASK-0019/verification.md`. Earlier VERIFIED rows are historical.
The overall realistic-colour/anatomical product target remains PARTIAL; draft module status is retained.

TASK-0019/REQ-010: Palette is optional for colour and accents. Missing palette delegates selection to the design process using the idea and reviewed references; it is not a missing client answer. Empty panel input is omitted. Explicit palettes remain bounded and validated. Colour rendering remains pending.
