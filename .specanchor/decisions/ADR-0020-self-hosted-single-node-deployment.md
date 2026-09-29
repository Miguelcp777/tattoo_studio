---
type: adr
status: accepted
id: ADR-0020
created: 2026-09-29
---

# ADR-0020: One self-hosted node, on the owner's own hardware

## Context

`architecture.spec.md` and `platform.spec.md` both record deployment topology and region as
**undecided**, and both note that region has GDPR residency consequences. Nothing was deployed, so
the camera try-on (TASK-0042) could not be tested at all: a browser refuses `getUserMedia` outside
a secure context, and development runs on `http://` over the LAN.

The owner first asked for Netlify. That does not fit what this system is:

- The worker is a FastAPI process with two SQLite files, an encrypted file store on disk, and a job
  queue that runs in a background thread; a single generation takes about 200 seconds. Serverless
  functions have no persistent disk and no long-running process.
- Web sessions are held in a module-level `Map` (`globalThis.inkcraftSessions`) holding the whole
  consultation state. Across serverless instances they would evaporate, and every request after the
  first would fail as an expired session.
- Netlify's functions run in the United States by default. "Your photographs do not leave Europe"
  is one of the product's few real advantages over BlackInk and Tatship; deploying to a US region
  while claiming it would be a lie in the marketing rather than a gap in the code.

The owner has a Proxmox host and can run a VM on it.

## Decision

**Everything runs on one self-hosted node**, described by `infra/`:

1. *(Amended by TASK-0044: the VM already runs Coolify, which owns 80/443 and terminates TLS, so
   our Caddy layer was removed and no service binds a host port.)*
   **Three containers**: `caddy` terminates TLS, `web` is the Next.js studio, `worker` is the Python
   service. Only Caddy publishes ports. The worker is unreachable from outside the compose network
   and is authenticated by `TATTOO_WORKER_TOKEN` even there.
2. **The region is the owner's hardware.** This resolves the open question in
   `architecture.spec.md` and `platform.spec.md`: data at rest lives on a machine the owner
   controls, which satisfies the residency claim more strictly than any cloud region would.
3. *(Amended by TASK-0044: Coolify issues and renews the certificate; the DNS-01 option remains
   available through Coolify for a hostname that resolves only privately.)*
   **TLS by DNS-01.** The certificate is issued through the DNS provider's API, so no inbound port
   needs to be open to the internet for validation, and the hostname may resolve only on a private
   network. A private hostname with a genuine certificate is a supported configuration, and it is
   enough for the camera.
4. **The worker is a single replica, permanently.** Its queue is in-process; two replicas would be
   two schedulers over one SQLite file.
5. **State is a volume, not a container.** `worker-data` holds the encrypted media store and both
   SQLite files. `TATTOO_MEDIA_KEY` is generated once and never rotated casually: it is what the
   store is encrypted with, so changing it destroys access to everything already stored.
6. **In-memory sessions are accepted, and their failure mode is documented**: restarting the web
   container ends every open consultation. This is tolerable for a single node with one process and
   is called out in the runbook rather than hidden.

## Alternatives considered

- **Netlify for the front end, worker elsewhere.** Would work only after moving session state to a
  shared store — real work, an extra provider, and the front end still outside the EU on the free
  plan. Rejected as more moving parts for less control.
- **Static export on Netlify with all APIs elsewhere.** Requires rewriting the API routes and
  solving cross-origin cookies. The most work of the three, for no benefit on a single-tenant
  product.
- **A managed EU host (Fly.io, Railway, Render) with a volume.** A reasonable fallback and the
  natural move if the owner later wants uptime they do not maintain themselves. Rejected now
  because self-hosting is free, already available, and strictly better for the residency claim.

## Consequences

- **Availability is now the owner's problem**: power, network, backups, and the Proxmox host itself.
  The runbook gives the backup command; the media key must be backed up separately from the volume,
  or the archive is unreadable.
- **There is still no authentication.** On a reachable URL, anyone who finds it can spend the
  owner's model credits. The runbook says so first, before any step, and suggests keeping DNS
  private or adding basic auth until Phase 0's authentication decision is made. This ADR does not
  resolve that; it makes the exposure explicit.
- Updating is `git pull && docker compose build && up -d`. There is no blue/green and no rollback
  beyond checking out an earlier commit and rebuilding.
- The web image is deliberately not a Next `standalone` bundle: the app is a pnpm workspace with a
  native dependency, and tracing that is a class of failure that only appears in production.

## Validation / revisit conditions

- **Owed:** the images have never been built. The development machine has no Docker, so only the
  commands the Dockerfiles run were verified, not the images themselves.
- **Revisit** when authentication lands: the "keep it private" advice in the runbook should become
  unnecessary.
- **Revisit** if the owner wants uptime they do not maintain, or a second node: the in-process job
  queue and the in-memory sessions are the two things that make this single-node only, and both
  would have to move first.
