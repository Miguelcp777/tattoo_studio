---
type: adr
status: accepted
id: ADR-0021
created: 2026-09-29
---

# ADR-0021: Accounts come from Supabase, and the studio asks it who is calling

## Context

`web.spec.md` has carried "Authentication approach is undecided" since TASK-0001, while also
stating that the web tier "enforces authentication and authorization on every route". It enforced
none: a consultation, an upload and a generation were all available to anyone who reached the URL.

That stopped being theoretical on 2026-09-29, when the studio was deployed behind a real domain
(ADR-0020, TASK-0043/0044). Every generation spends money on the owner's OpenAI, Anthropic and BFL
accounts, and a single design costs several image calls. The exposure is not data theft, it is a
stranger spending until the credit runs out — which had already happened once that day by ordinary
use.

The VM runs Supabase, which the owner chose to adopt. Authentication is the part of it worth having
first: it is self-contained, it closes a live hole, and it does not touch the storage layer, whose
encryption, retention and cascade-deletion carry invariants.

## Decision

1. **Supabase is the authority on a token; we do not verify signatures.** Each request's access
   token is presented to Supabase's `/auth/v1/user`, which answers with the account or refuses.
   The alternative — verifying the JWT locally — means holding the signing secret in this
   deployment and writing token parsing, which is where authentication goes subtly wrong. Supabase
   runs on the same host, so the call costs nothing worth optimising against a 200-second job.
2. **Tokens live in HttpOnly cookies and the exchange happens server side.** The password reaches
   our route and goes nowhere but Supabase; the tokens are set as `HttpOnly`, `SameSite=strict`
   cookies, `Secure` in production. Script running on the page cannot read them.
3. **There is no sign-up.** The studio offers sign-in only; accounts are created by the owner in
   Supabase. A studio that lets anyone register is a studio that lets anyone spend, which is the
   hole this ADR exists to close.
4. **The API is the security boundary; the middleware is a courtesy.** Middleware checks only for
   the presence of a cookie, so a page load costs no network call, and a forged cookie gets no
   further than the HTML shell. Every route that spends money or reads stored work calls
   `requireAccount`, which verifies with Supabase.
5. **An unconfigured deployment refuses everyone.** Missing `SUPABASE_URL` or `SUPABASE_ANON_KEY`
   is a 503, never an open door (PLAT-INV-005). Misconfiguration is exactly when the opposite
   default would be catastrophic.
6. **Only the anon key is used.** Nothing in the studio acts as an administrator, so the
   service-role key is not part of this deployment and cannot leak from it.
7. **An expired access token is renewed transparently** from the refresh token, and the renewed
   pair is re-issued on the same response. A consultation is long; being signed out mid-design
   would be a self-inflicted wound.

## Alternatives considered

- **HTTP basic auth at the proxy.** A single shared password, five minutes of work, and it does
  close the spending hole. Rejected as the destination but recommended as the stop-gap until this
  shipped: it has no notion of a user, so it cannot become per-user ownership (TASK-0046) or the
  studio accounts of Phase 3.
- **Local JWT verification with the Supabase signing secret.** One fewer network call per request.
  Rejected: it puts a high-value secret in this deployment and puts token parsing in our code, to
  save a call to a service on the same machine.
- **Supabase's JavaScript client with tokens in browser storage.** The common pattern, and the
  reason token theft by injected script is common. Rejected in favour of HttpOnly cookies.
- **Sign-up with an email allowlist.** More convenient for adding people later. Rejected for now:
  it is more moving parts around the exact risk being closed, and the owner can create an account
  in Supabase in seconds.

## Consequences

- **Anonymous use is over.** There is no trial or demo path; a visitor sees a sign-in page. That is
  a product decision as much as a security one, and it will need revisiting if the studio ever
  wants the public to try it.
- Supabase becomes a hard runtime dependency of the web tier: if it is down, nobody signs in and
  nobody with an expired token can continue. The studio fails closed.
- Designs were still owned by the anonymous studio session, not by the account, so signing in as
  yourself on another device showed nothing. **Settled by TASK-0046**: the account id is the owner
  the worker scopes storage by. That change also had to undo this decision's quietest consequence —
  erasing your work blocklisted the owner, which is a permanent lockout once the owner is an
  account — replacing the blocklist with a deletion timestamp.
- Every route test now drives the real guard, which is why they all had to carry an account. The
  cost is a noisier diff; the gain is that each route proves it refuses a stranger.

## Validation / revisit conditions

- **Settled 2026-09-29:** a real sign-in against the Supabase on the VM, from the deployed studio
  on its own domain (TASK-0045/ev-003). The decision to let Supabase answer "who is this token"
  works against the real service, not only against the suite's fake.
- **Owed:** a renewal against the real Supabase. No live session has yet outlived its access token,
  so consequence 7 is proven only against the fake.
- **Learned in deployment:** `SUPABASE_URL` must be the address Supabase answers on *from inside
  the web container* — not `localhost`, which is the container itself. Recorded in
  `platform.spec.md` so the next deployment does not rediscover it.
- **Revisited by TASK-0046**, as foreseen: the account id is now that owner, and deletion keeps its
  cascade while ceasing to be a lockout.
- **This decision is wrong if** the studio needs to let strangers try it before signing up. The
  answer then is a quota per anonymous session, not an open door.
