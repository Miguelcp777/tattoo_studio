---
type: module-spec
module: consultation
status: draft
source_paths:
  - packages/consultation/*
last_reviewed: 2026-09-19
---

# Module: consultation

## Responsibility

Act as an experienced tattoo artist taking a brief. Turn a vague idea into a complete, validated
`TattooBrief` by asking targeted questions. It produces a contract, not a conversation transcript.

## Source ownership

`packages/consultation/`

## Public interfaces

- `start(idea) -> ConsultationState`
- `advance(state, user_message) -> ConsultationState` — a state machine step
- `brief(state) -> TattooBrief | Incomplete` — returns a brief only when every required slot is
  filled and valid

## Inputs and outputs

Input: free-text user messages. Output: a progressively filled brief plus the next question to ask.

## Domain invariants

- CONSULT-INV-001: This module never generates imagery. It only produces briefs (ARCH-INV-001).
- CONSULT-INV-002: A brief is emitted only when it validates against `tattoo-brief.schema.json`.
  Partial briefs are explicitly typed as incomplete.
- CONSULT-INV-003: Free-text style input is mapped onto the closed curated vocabulary. Unmapped
  styles prompt a clarifying question rather than passing through raw.
- CONSULT-INV-004: Size is captured in millimetres, and the user is asked for it explicitly rather
  than having it inferred.
- CONSULT-INV-005: A request to imitate a named living artist is declined in-conversation with an
  explanation, and the brief is steered to the underlying style instead (PROD-INV-004).

## Data / persistence

Consultation state persists per session so a user can resume. Transcripts follow the brief
retention lifecycle, not the photo lifecycle.

## Dependencies

`contracts`, `safety`.

## External integrations

Claude API for structured extraction. `claude-opus-5` for the consultation reasoning,
`claude-sonnet-5` for cheap classification such as style mapping. Structured output via tool use,
so extraction returns typed data rather than parsed prose.

## Error semantics

Typed errors for: model unavailable, extraction produced invalid data, policy refusal. An
extraction that fails validation retries once with the validation error as feedback, then
surfaces a clarifying question rather than guessing.

## Security and permissions

No photographs. Transcripts may contain personal meaning behind a tattoo and are treated as
personal data, though at lower sensitivity than imagery.

## Observability

Turns to a complete brief, slot-fill rates, clarification loops per slot, decline counts by
reason. A slot needing many clarifications indicates a badly worded question.

## Performance / operational constraints

Interactive and synchronous. Each turn must feel conversational, which bounds model latency
choices. This is the one path in the system not routed through `jobs`.

## Tests / verification

The state machine is tested deterministically with recorded model responses. A scripted corpus of
idea-to-brief conversations asserts that each reaches a valid brief. Style mapping is tested
against a labeled fixture set including adversarial artist-name requests.

## Known uncertainties and debt

- The question set and its ordering are undesigned; TASK-0003 owns this.
- How many turns users tolerate before abandoning is unknown.
- Whether consultation should propose reference imagery is undecided.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Typed state machine, not an agent framework | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Claude API with tool-use structured output | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Question set design | UNKNOWN | TASK-0003 pending | NOT_RUN |
