# Deploying the studio on your own host

One VM runs everything: the Next.js studio, the Python worker and a reverse proxy that terminates
TLS. Nothing is on a third-party platform, which is what lets the product say the data stays on
European hardware (ADR-0020).

```
internet ──▶ caddy ──▶ web ──▶ worker ──▶ /data (encrypted media, SQLite)
             :443       :3000     :8000
```

Only Caddy publishes a port. The worker is unreachable from outside the compose network: it holds
the media store and the generation credentials.

---

## Read this before you expose it

**There is no authentication yet.** Anyone who reaches the URL can run a consultation and generate
designs, and every generation spends money on your OpenAI and BFL keys. A single design costs
several image calls.

Until authentication exists (Phase 0, still an open decision), do one of:

- keep the DNS record private to your network or VPN, or
- put HTTP basic auth in front of it in the `Caddyfile`, or
- accept the risk knowingly and watch the provider dashboards.

The DNS-01 certificate works fine for a hostname that only resolves on your own network, so
"private DNS + real certificate" is a perfectly good combination — and it is enough for the camera,
which only needs a secure context.

---

## 1. The VM

Debian 12 or Ubuntu 24.04. Suggested: **4 vCPU, 8 GB RAM, 40 GB disk**. The worker does real image
work (scikit-image, Pillow) on the CPU, and the web image carries a full `node_modules`.

Install Docker Engine and the compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in
```

## 2. The repository

```bash
git clone https://github.com/Miguelcp777/tattoo_studio.git
cd tattoo_studio/infra
```

## 3. DNS and the certificate

The certificate is issued over a **DNS-01 challenge**, so you never have to open port 80 to the
internet for validation.

1. Point a hostname at the VM (a record on your internal DNS is fine).
2. Create an API token at your DNS provider, scoped to **edit that zone only**.
3. If your provider is not Cloudflare, find its module at `https://github.com/caddy-dns` and set
   both `CADDY_DNS_MODULE` and `CADDY_DNS_PROVIDER` accordingly.

## 4. Configuration

```bash
cp .env.example .env
openssl rand -hex 32   # -> TATTOO_WORKER_TOKEN
openssl rand -hex 32   # -> TATTOO_MEDIA_KEY
$EDITOR .env
```

> **`TATTOO_MEDIA_KEY` encrypts the media store.** Change it and every stored design, photo and
> stencil becomes unreadable. Generate it once, back it up somewhere other than the VM, and treat
> rotating it as a data migration, not a config change.

`infra/.env` is gitignored. Keep it that way; it holds every credential the studio has.

## 5. Start

```bash
docker compose build
docker compose up -d
docker compose logs -f caddy   # watch the certificate being issued
```

## 6. Check it

```bash
curl -s https://$TATTOO_DOMAIN/ -o /dev/null -w '%{http_code}\n'      # 200
docker compose exec worker curl -s localhost:8000/health              # {"status":"ok",...}
```

Then, on a phone, open `https://<your-domain>/` and run a consultation through to a design. Open
the design and press **Pruébalo con la cámara**: the browser should ask for camera permission. If
it does not, you are not on HTTPS — the camera is refused outside a secure context, by every
browser, with no way around it.

## Operating it

**Backups.** Two things matter and they must be kept together:

```bash
docker run --rm -v tattoo-studio_worker-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/worker-data-$(date +%F).tgz /data
```

...plus `infra/.env` (for `TATTOO_MEDIA_KEY`). The archive without the key is unreadable; the key
without the archive is useless.

**Updating.**

```bash
git pull && docker compose build && docker compose up -d
```

The `caddy-data` volume holds the issued certificate and the ACME account, so a redeploy does not
re-issue and cannot hit rate limits.

**Do not scale the worker.** Its job queue runs in a thread inside the process. Two replicas would
be two schedulers over one SQLite file, handing the same job to both.

**Retention.** Uploads expire after 24 hours and a deleted photo takes every artifact derived from
it with it. That is the worker's behaviour, not the deployment's, and it does not depend on any
configuration here.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Caddy loops on "obtaining certificate" | The DNS token cannot write the challenge record for that zone. Check the token's scope, and `CADDY_DNS_PROVIDER` matches the compiled module. |
| The site loads but the camera button does nothing | Not a secure context. Confirm the URL is `https://` and the certificate is trusted on that phone. |
| Generating returns 503 "no se puede conectar con el worker" | The worker container is unhealthy. `docker compose logs worker`. |
| Generating fails with 429 | The provider account is out of credit. |
| Every message says "la sesión ha caducado" | The web container restarted: sessions are in memory and do not survive a restart. |
