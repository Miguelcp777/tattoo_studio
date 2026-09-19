---
type: module-spec
module: stencil
status: draft
source_paths:
  - services/worker/stencil/*
last_reviewed: 2026-09-19
---

# Module: stencil

## Responsibility

Produce the artifact a tattooer actually uses: clean, single-weight line art as vector, exportable
at true physical size for thermal transfer paper.

## Source ownership

`services/worker/stencil/`

## Public interfaces

- `render_linework(brief, design) -> LineArt` — a dedicated line-art generation pass
- `trace_to_vector(line_art) -> VectorStencil` — centerline tracing
- `export_stencil(vector, size_mm, mirrored, dpi) -> PrintAsset`

## Inputs and outputs

Input: the brief and its accepted design. Output: an SVG stencil and a print-ready PDF carrying
true physical dimensions.

## Domain invariants

- STENCIL-INV-001: Line art is produced by its own generation pass. It is NOT derived by edge
  detection or thresholding of the shaded flash render — that yields doubled contours and broken
  paths (ADR-0003).
- STENCIL-INV-002: Exports carry true physical dimensions and print at 1:1 with no scaling
  (PROD-INV-002).
- STENCIL-INV-003: Export resolution is at least 300 DPI at the stated physical size.
- STENCIL-INV-004: A mirrored variant is available for thermal transfer paper.
- STENCIL-INV-005: Traced output is closed, single-weight paths — no double contours, no hairline
  fragments below the stated minimum path length.

## Data / persistence

Vector and print assets persist with the design version they belong to.

## Dependencies

`contracts`, `generation`, `media`, `jobs`.

## External integrations

Vector tracing library (candidates: vtracer, potrace with a centerline mode, or autotrace).
Selection is open; see uncertainties.

## Error semantics

Typed errors for: line-art generation failed, tracing produced degenerate geometry, requested
physical size outside supported bounds.

## Security and permissions

No user photographs. Stencils contain no personal likeness and therefore follow the design
retention lifecycle, not the photo lifecycle (see quality-and-security spec).

## Observability

Trace path counts, rejected-geometry rate, export size distribution.

## Performance / operational constraints

Tracing is CPU-bound and local; it must not require a GPU.

## Tests / verification

Golden-file tests over tracing with fixed inputs. Dimensional tests asserting that an exported PDF
measures exactly the requested millimetres. A physical print test is part of acceptance for
TASK-0005 and is human-run.

## Known uncertainties and debt

- Centerline vs outline tracing quality across styles is unproven; fine-line and blackwork will
  behave very differently.
- Whether hosted models can produce sufficiently clean line art is the key open risk.
- Minimum viable line weight for transfer paper has not been established with a real tattooer.

## Alignment notes

No implementation exists; nothing to align yet.

## Change history

- 2026-09-19: Created during SDD bootstrap.

## Statement evidence
| Statement | Evidence status | Source / revision | Verification result |
|---|---|---|---|
| Native line-art pass, not edge detection | INTENT | ADR-0003 | NOT_RUN |
| 1:1 physical export at >=300 DPI | INTENT | Planning session 2026-09-19 | NOT_RUN |
| Tracing library suitability | UNKNOWN | Untested | NOT_RUN |
