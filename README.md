# Tattoo Creator

Turn a tattoo idea into two things that matter: a **stencil a tattooer can actually use**, and a
**mockup on your own skin** so you know what you are committing to.

## Status

**Deployed pilot, partial implementation of the product goal.** Inkcraft runs at
`inkcraft.aurevanta.es` on the owner's VM (Coolify). Accounts are created by the studio in
Supabase; sign-in asks for the terms and image consent. A guided studio takes an idea through
missing details, references (Wikimedia Commons, Openverse and, when configured, Brave), an editable
summary and the design: artwork in colour or black and grey, a mockup on generated skin or on the
client's own photo, and a stencil as SVG and PDF with a mirrored copy and a calibration bar.
Daily limits per account and for the studio stop runaway spending.

What it is not: stencils of realistic or colour work are approximate contours for a tattooer to
review, the skin uses reference anatomy rather than the client's measurements, and physical
printing and final tattoo quality are unverified. Passing software tests is not that approval.

## Run locally

Requires Node 22+, pnpm, Python 3.11+ and uv.

```powershell
pnpm install
uv sync --project services/worker
```

Set `OPENAI_API_KEY` in `services/worker/.env`, and `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
`apps/web/.env.local` (never commit either), then:

```powershell
pnpm dev
```

The launcher starts Next.js at `http://127.0.0.1:3000` and one worker at port 8000.
It creates a random shared service token and a 32-byte media encryption key in ignored
local environment files. Preserve the encryption key if you want to read existing local assets.
Optional `STUDIO_WEB_PORT` / `STUDIO_WORKER_PORT` select alternate ports.
`TATTOO_IMAGE_MODEL` and `TATTOO_VISION_MODEL` configure provider models in the worker.
Generated work uses the configured paid API; there are no automatic generation retries.

Use an explicit idea, style, placement, colour and dimensions, for example:
"Mare de Déu dels Desamparats y Senyera Valenciana, línea fina en el gemelo derecho,
solo negro, 8 x 15 cm". Review each reference before generating.
The optional body-photo width calibrates a planar preview, not anatomical surface measurements.

Sign-in uses HttpOnly cookies issued from Supabase tokens. The consultation in progress is kept by
the worker for a day after its last change, so a web restart does not lose it (TASK-0079); designs
belong to the account and do not expire. Photos of a body expire after 24 hours, with everything
composed on them. The worker runs one job at a time on one replica.

## Product target (partly pending)

1. **Consultation.** A guided conversation that works like a real intake: style, subject, line
   weight, shading, placement, and size in millimetres. It produces a structured brief.
2. **Flash.** The shaded reference render — the artwork you recognise as "the design".
3. **Stencil.** Clean single-weight line art, traced to vector, exported at true 1:1 physical size
   with a mirrored variant for thermal transfer paper.
4. **Mockup.** The design placed on your photograph, warped to the body's actual surface and
   blended so it reads as ink under skin.
5. **Handoff sheet.** What you take to the shop: the stencil at 1:1, the reference render, the
   dimensions, and placement notes.

## How this repository works

This project uses spec-driven development via the Spec Anchor protocol. Contracts live in
`.specanchor/` and code is verified against them in both directions.

- `CLAUDE.md` — working rules and hard constraints
- `.specanchor/README.md` — the protocol
- `.specanchor/spec-index.md` — modules, specs and invariant ownership
- `.specanchor/decisions/` — architectural decisions and why

Documentary coverage check:

```bash
python scripts/check-spec-sync.py --baseline
```

This checks that every source file is anchored to a specification. It does not check that the code
is correct — that is what tests and review are for, and the two results are always reported
separately.

## Requirements

Git, Python 3.11+, Node 22+, pnpm and uv.

## A note on scope

Generated previews are visualizations, not guarantees. Healing and aging views are illustrative
and are not predictions about any individual's skin. The project does not imitate the style of
named living tattoo artists.
