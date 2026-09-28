---
type: finding
id: FINDING-0004
created: 2026-09-26
status: resolved
raised_by: TASK-0032
resolved_by: TASK-0033
affects: [consultation, web]
---

# FINDING-0004: The live consultation route bypasses `ConsultationProvider`, so the Claude agents are not yet active

## What was noticed

While implementing TASK-0032/REQ-004 and REQ-005, the wiring of the active web route was traced.
Evidence status: OBSERVED (code inspection at HEAD `8896fee` plus the TASK-0032 working tree).

- `apps/web/src/lib/studio-server.ts` constructs `new OrchestratorAgent()` with no arguments.
- `OrchestratorAgent` extracts slots with the deterministic `extractPreferences` (regex, in
  `agents/researcher.ts`). It never calls a `ConsultationProvider`.
- Its default `VisualSearchAgent` is built without `ScoutOptions`, so no query planner, open-web
  fallback or candidate screen is used.
- `ConsultationProvider` (fixture, OpenAI Astra, and now Claude) is consumed only by the
  `start`/`advance` state machine, which the consultation spec already records as "test/legacy
  code, not the active web route".

## Why it matters

TASK-0032 delivered the Claude architect (`ClaudeConsultationProvider`, Opus 5.5) and the Claude
scout planner (`ClaudeScoutQueryPlanner`, Sonnet 5) as tested capabilities behind the declared
seams. The product-level promise — the live chat reasoning on Claude and the scout choosing its
own queries — is not true until the active route uses them. Reporting REQ-004/005 as satisfied
without this note would overstate what a user experiences.

## What wiring would require

1. **Scout (small):** construct the web orchestrator with
   `new VisualSearchAgent(undefined, { planner: new ClaudeScoutQueryPlanner() })`, opted in by an
   explicit setting (not mere key presence, so a developer's key cannot make tests call the API).
   An open-web search provider and a TS candidate screen do not exist yet; ingest-time screening in
   the worker remains the enforced gate.
2. **Architect (design change):** `OrchestratorAgent` must call a `ConsultationProvider` for
   extraction, keeping the regex path as the offline fallback, the three-question cap, and
   CONSULT-INV-002 validation. This changes the active consultation contract and needs its own
   task spec and a `web` spec update.

## Suggested handling

Take it up as a follow-up task (full change: `consultation` + `web`). Not done silently inside
TASK-0032, whose declared scope does not include `web`.

## Resolution (2026-09-26, TASK-0033)

Both items were implemented with explicit opt-in (`TATTOO_CONSULTATION_BACKEND`,
`TATTOO_SCOUT_PLANNER`). Still open and out of that task's scope: an open-web search provider, a TS
candidate screen, and flagging architect-proposed lines in the master brief.
