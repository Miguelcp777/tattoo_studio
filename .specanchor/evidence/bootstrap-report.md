# Bootstrap Report

**Date:** 2026-09-19
**Revision:** `cbb2641bfdb1a41cb2f4e12702adf112e9eb70e6`
**Scope:** Greenfield adoption of the Spec Anchor protocol before any application code exists.

## What this bootstrap is, and is not

The standard bootstrap playbook is written for an existing application: inspect it, infer its
contracts, and anchor what is already there. This repository was empty, so there was nothing to
infer. Every behavioral statement in these specifications is therefore `INTENT` — desired
behavior accepted during planning — and not `OBSERVED` or `VERIFIED`.

That distinction matters for anyone reading the specs later. They describe a system that has been
agreed, not a system that exists.

## Sources

| Source | Kind |
|---|---|
| User's original proposal (architecture sketch, feature list, tech stack, risks) | INTENT |
| Planning session 2026-09-19, including four recorded scope decisions | INTENT |
| `sdd-spec-anchor` skill v1.1.0 templates, references and guard script | Tooling |

Four decisions were taken by the user during planning and are recorded in the ADRs:

1. v0 scope includes user photo upload.
2. Hosted image APIs behind a provider adapter.
3. Hybrid mockup pipeline: geometric warp, then constrained AI blend.
4. Next.js plus Python worker.

On (1), the recommendation during planning was to defer photo upload and ship with anatomical
presets, on the grounds that it pulls GDPR-sensitive data handling into the first milestone. The
user chose the full slice. ADR-0006 records that choice and its consequences explicitly rather
than leaving the disagreement undocumented.

## Runtime evidence

| Check | Command | Result |
|---|---|---|
| Git present | `git --version` | VERIFIED — 2.51.0.windows.1 |
| Python present | `python --version` | VERIFIED — 3.13.5 |
| Node present | `node --version` | VERIFIED — v22.16.0 |
| Repository initialised | `git init`, `git symbolic-ref HEAD refs/heads/main` | VERIFIED — branch `main` |
| Config key set valid | JSON load of `anchor.yaml` | VERIFIED — exactly the 5 required keys, version 2 |
| Module globs non-overlapping | Ownership probe over 7 representative paths | VERIFIED — each path resolves to exactly 1 module |
| All mapped specs exist | Existence check over `module-map.json` | VERIFIED — 11/11 present |

**No application tests were run, because none exist.** There is no build, no lint and no test
suite in this repository yet. They arrive in TASK-0001.

## Coverage

```
python scripts/check-spec-sync.py --baseline
```

```json
{
  "revision": "cbb2641bfdb1a41cb2f4e12702adf112e9eb70e6",
  "material_files": ["CLAUDE.md", "scripts/check-spec-sync.py"],
  "unmapped": [],
  "functional_validation": "NOT_RUN"
}
```

Exit code 0. Unmapped list empty, satisfying SETUP-INV-001.

The material inventory is only two files. That is expected and not a sign of good coverage: specs,
`anchor.yaml`, `.gitignore` and `README.md` are excluded by configuration, and specification files
are classified as specs rather than material. The inventory will grow with the first code.

### Guard enforcement verified, not assumed

A baseline pass over two files proves very little, so enforcement was tested directly:

| Condition | Result |
|---|---|
| Unmapped file `src_unmapped_probe.py` present | `ERROR: Unmapped material file` — coverage FAIL, exit 1 |
| Probe removed, clean tree | Coverage PASS, exit 0 |

The probe was deleted after the check; it is not in the tree or in history.

## Structure established

- 5 global specs: architecture, product-behavior, quality-and-security, coding-standards,
  project-setup.
- 11 module specs, all `draft`: contracts, web, consultation, generation, flash, stencil, mockup,
  media, safety, jobs, platform.
- 6 ADRs, all `proposed`: ADR-0001 through ADR-0006.
- Cross-cutting invariants declared in global specs, with enforcement assigned to named modules in
  `spec-index.md`.

Module globs are deliberately non-nesting. The guard uses `fnmatch`, where `*` matches slashes, so
`apps/web/*` would have claimed a nested consultation package and given those files two owners.
`packages/consultation/*` avoids it, and `platform` owns root files by exact path for the same
reason.

## Uncertainties carried forward

Recorded in the specs, repeated here because they are the real state of the project:

**Technical**

- ADR-0002 (mockup blending) is unvalidated and is the largest architectural risk. TASK-0008 is a
  spike that may overturn it.
- The geometry tolerance protecting PROD-INV-001 has no numeric value yet. Without it, ADR-0002
  provides no actual protection.
- Whether hosted models produce line art clean enough to trace is unproven, and the stencil is the
  product's core value.
- Style fidelity without a LoRA is untested.

**Undecided infrastructure**

Queue backend, object storage, database, authentication, CI provider, hosting platform,
deployment region, TypeScript package manager, Python dependency manager. The module map currently
anticipates `pnpm-workspace.yaml` and `.github/*`; both are provisional and must be corrected if
the choices differ.

**Non-technical, and blocking for launch**

- No legal review of consent text, lawful basis or retention periods has occurred.
- Whether a DPIA is required is undetermined. Assume yes.
- Retention window and backup rotation period are undefined, and SEC-INV-004 cannot be satisfied
  precisely without them.
- Moderation accuracy on body imagery is unmeasured, and no appeal path exists for false
  positives.

## Deliverable summary

| Result | Value |
|---|---|
| Documentary coverage | **PASS** (exit 0, no unmapped material files) |
| Functional alignment, Spec to Code | **NOT_VERIFIED** — no code exists |
| Functional alignment, Code to Spec | **NOT_VERIFIED** — no code exists |
| Application tests | **NOT_RUN** — none exist |

Documentary coverage passing means every file is anchored to a specification. It says nothing
about whether the system works, because there is no system yet.

## Next steps

TASK-0001 establishes the repository skeleton, toolchain and CI, at which point the material
inventory becomes meaningful and the test commands in `.specanchor/README.md` can be filled in.

Recommended order thereafter: TASK-0002 (brief contract), TASK-0004 (generation adapter and
flash), TASK-0005 (stencil), TASK-0006 (jobs), TASK-0007 (media, consent, moderation), TASK-0008
(mockup spike), TASK-0003 (consultation), TASK-0009 (aging), TASK-0010 (handoff sheet).

Two items should be started in parallel with engineering, because they have long lead times and
can invalidate work already done: legal review of the photo-processing posture, and finding a
working tattooer willing to test stencil output on transfer paper.
