# Tattoo Creator

Turn a tattoo idea into two things that matter: a **stencil a tattooer can actually use**, and a
**mockup on your own skin** so you know what you are committing to.

## Status

**Specification phase.** No application code exists yet. The repository currently contains the
contracts the code will be built and verified against.

## What it will do

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

Git, Python 3.10+, Node 22+.

## A note on scope

Generated previews are visualizations, not guarantees. Healing and aging views are illustrative
and are not predictions about any individual's skin. The project does not imitate the style of
named living tattoo artists.
