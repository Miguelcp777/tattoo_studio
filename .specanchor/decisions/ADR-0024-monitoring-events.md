---
type: adr
status: accepted
id: ADR-0024
created: 2026-09-30
---

# ADR-0024: The studio records what it does, and never what a body looks like

## Context

The owner wants to monitor the whole app: an administrator who can see what users made, how they
used the studio, the tokens spent and time and usage metrics. Asked how, they chose Supabase
Postgres as the store, with a login of its own rather than Supabase's master key (TASK-0054), and
the administrator seeing designs but never body photographs (TASK-0055).

Every generation already spends real money on OpenAI, Anthropic and BFL, and until now nothing
recorded how much, for whom, or whether it failed. The providers report token counts in their
responses; nothing read them.

## Decision

1. **One append-only table of events.** Paid provider calls (provider, operation, model, duration,
   input and output tokens, images, outcome), generations (outcome, duration, style, zone, colour,
   whether an own photo was used), uploads and their refusals, kept photos, erasures, consultation
   turns (what the client wrote and what the studio answered) and sign-ins.
2. **The worker is the only writer.** It alone holds the database login. The web tier, which faces
   the internet, reports what it sees — its Claude calls, turns, sign-ins — to the worker over the
   existing service token. The account of such an event is the authenticated header's, never the
   body's, and its cost is computed by the worker, never accepted from the web tier.
3. **Least privilege, stated in SQL.** `infra/supabase/telemetry.sql` creates `inkcraft.events`
   and a login that may insert, read and delete there, and update only the two columns that
   anonymising clears. No other table, no ownership, no master key.
4. **No image, ever.** Events carry ids, sizes, counts, durations, token counts and bounded text. A
   body photograph is recorded as having been uploaded, not as what it shows.
5. **Tokens are facts; money is configured.** Token counts come from the providers' responses. A
   cost is computed only from prices the owner sets in `TATTOO_PRICES`; with none, it is empty.
   The studio does not guess what a provider charges.
6. **Monitoring never breaks the studio.** Writes are buffered and flushed in the background; a
   database that is down loses events, counted, and fails no request. A misconfigured connection,
   on the other hand, stops the worker at startup (PLAT-INV-005), without quoting its password.
7. **Erasure reaches the record.** "Delete my data" strips the account and the text from that
   account's events; the numbers stay, unattributed, so totals remain true. Events are deleted
   after 365 days by default.
8. **Said before it happens.** The sign-in page states what is recorded, that body photos are not,
   and what erasure does.

## Alternatives considered

- **The web tier writing directly to Postgres.** One hop fewer, and the database credential on the
  internet-facing tier. Rejected.
- **Supabase's service-role key.** Rejected in ADR-0021 and again here: it can do anything.
- **An observability stack (Grafana, Loki).** Good at dashboards, poor at "what did this client
  make and say", which is what was asked. Not ruled out as a later addition.
- **Estimating cost from a built-in price list.** Prices change; a stale list would present guesses
  as facts. Rejected in favour of owner-configured prices.

## Consequences

- Consultation text is now personal data held for up to a year. The sign-in notice says so; a
  legal review of retention (open since ADR-0006) should cover it.
- Supabase Postgres becomes a startup dependency of the worker when a connection is configured.
- The Postgres path has not been executed against a Postgres server in development; its statements
  are the SQLite path's, which the tests run.
