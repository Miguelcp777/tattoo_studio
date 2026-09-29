# Deploying the studio

The studio runs on the owner's own VM, deployed by **Coolify**, which is already installed there
alongside Supabase and N8N (ADR-0020, TASK-0044). Nothing is on a third-party platform, which is
what lets the product say the data stays on European hardware.

```
coolify's proxy ──▶ web:3000 ──▶ worker:8000 ──▶ /data (encrypted media, SQLite)
```

Coolify owns ports 80 and 443 on that host and terminates TLS, so **no service here publishes a
host port**. The worker is reachable only on the compose network: it holds the media store and the
generation credentials, and its only caller is the web app.

---

## Read this before you attach a public domain

**There is no authentication yet.** Anyone who reaches the URL can run a consultation and generate
designs, and every generation spends money on your OpenAI and BFL keys. A single design costs
several image calls.

Until authentication exists (Phase 0, still an open decision), do one of:

- point the hostname only at your own network or VPN, or
- put Coolify's basic authentication in front of the resource, or
- accept the risk knowingly and watch the provider dashboards.

The camera only needs a *secure context*, not a *public* one, so a private hostname with a real
certificate is a perfectly good combination.

---

## 1. Create the resource

In Coolify, on the server that runs this VM:

1. **+ New → Docker Compose** (not Dockerfile: there are two services).
2. Source: this git repository, branch `main`.
3. **Compose file path**: `infra/docker-compose.yml`.
4. **Base directory**: `/` — the images build from the repository root, because the web image needs
   the pnpm workspace and the worker needs `contracts/python`.

## 2. Secrets

Generate two, once:

```bash
openssl rand -hex 32   # TATTOO_WORKER_TOKEN
openssl rand -hex 32   # TATTOO_MEDIA_KEY
```

Add them in Coolify's **Environment Variables** panel, along with the provider keys. The full list
with explanations is in [.env.example](.env.example); it is a template and holds no values.

> **`TATTOO_MEDIA_KEY` encrypts the media store.** Change it and every stored design, photo and
> stencil becomes unreadable. Generate it once, back it up somewhere other than the VM, and treat
> rotating it as a data migration, not a config change.

## 3. Domain and certificate

Attach the domain to the **`web`** service on port **3000**. Coolify issues and renews the
certificate; you do not need the Caddy layer this repository used to carry.

If the hostname resolves only on your private network, use Coolify's DNS-01 challenge so issuance
does not need an inbound port from the internet.

## 4. Deploy and check

Deploy, then:

```bash
curl -s https://<your-domain>/ -o /dev/null -w '%{http_code}\n'   # 200
docker exec -it <worker-container> curl -s localhost:8000/health  # {"status":"ok",...}
```

Then, on a phone, open the site and run a consultation through to a design. Open the design and
press **Pruébalo con la cámara**: the browser should ask for camera permission. If it does not, you
are not on HTTPS — the camera is refused outside a secure context, by every browser, with no way
around it.

## Operating it

**Backups.** Two things matter and they must be kept together: the `worker-data` volume and
`TATTOO_MEDIA_KEY`. The volume without the key is unreadable; the key without the volume is
useless. Coolify can schedule the volume backup; keep the key somewhere else.

**Do not scale the worker.** Its job queue runs in a thread inside the process. Two replicas would
be two schedulers over one SQLite file, handing the same job to both. The compose file pins
`replicas: 1` and a test asserts it.

**Retention.** Uploads expire after 24 hours and a deleted photo takes every artifact derived from
it with it. That is the worker's behaviour, not the deployment's.

**Supabase.** It is installed on this VM but the studio does not use it yet: storage is still
SQLite plus the encrypted file store. Migrating to it is its own task.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `lstat /artifacts/infra: no such file or directory` | The build context must be the repository root. Coolify sets the compose project directory there, so `context: .` is correct and `context: ..` points above it. Running compose by hand instead needs `--project-directory ..`. |
| The deploy fails binding a port | Something in the compose file publishes 80 or 443, which Coolify already owns. No service here should have `ports:`. |
| The site loads but the camera button does nothing | Not a secure context. Confirm the URL is `https://` and the certificate is trusted on that phone. |
| Generating returns 503 "no se puede conectar con el worker" | The worker container is unhealthy. Check its logs in Coolify. |
| Generating fails with 429 | The provider account is out of credit. |
| Every message says "la sesión ha caducado" | The web container restarted: sessions are in memory and do not survive a restart. |
| The build runs out of memory | The web image installs a full pnpm workspace. Give the VM more RAM or build it once and push the image. |
