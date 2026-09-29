---
type: adr
status: accepted
id: ADR-0025
created: 2026-09-30
---

# ADR-0025: The administrator sees the studio's use and its designs, never a body

## Context

The owner asked for an administrator "que tenga acceso a todo lo que han creado otros usuarios,
cómo han interactuado, los tokens gastados, métricas de tiempo". Asked about body photographs, they
chose that the administrator does not see them; asked how to decide who is an administrator, they
chose a role in Supabase.

## Decision

1. **The role lives in `app_metadata.role = "admin"`.** Supabase writes `app_metadata` only with its
   administrative access; `user_metadata` is writable by any user with their own session, so a role
   there would let anyone promote themselves. The web tier reads the role from Supabase on every
   request to a panel route (`requireAdmin`); the header's "Panel" link decides nothing.
2. **Bodies are never shown, in two places.** The panel does not request any file a version marks
   as showing a body (`adminHidden`: the composite and background on an own photo, a kept camera
   photo). The worker independently refuses, with 403, any file that is a body photograph or that
   follows the photo lifecycle, whoever owns it — including every file stored before TASK-0047,
   when designs and photographs were not told apart.
3. **Every look is recorded.** Opening the metrics, an account's activity or a file writes an
   `admin` event under the administrator's own id: what was looked at, and when.
4. **What the panel shows** comes from the event record (ADR-0024) and the accounts' stored
   versions: totals and timings, consumption by model, activity by day, per-account summaries,
   recent errors, and per account its conversation, calls, uploads and designs.
5. **Accounts are named by the address they last signed in with**, recorded on sign-in in the
   event's text, which erasing the account clears. Before a first sign-in is recorded, an account is
   shown by its id.

## Consequences

- An administrator can read clients' conversations. The sign-in notice (ADR-0024) says the studio
  records messages; it does not single out the administrator, and a legal review should decide
  whether it must.
- There is no interface for granting the role; the owner sets it with one SQL statement in
  Supabase, which is the point: granting it takes access this studio does not have.
- Asset URLs for the panel go through the web tier with the administrator's session; nothing is
  public, and nothing is cached (`no-store`).
