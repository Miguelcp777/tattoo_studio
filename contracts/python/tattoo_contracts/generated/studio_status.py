# GENERATED FILE - DO NOT EDIT.
#
# Source: contracts/schemas/
# Regenerate: uv run python scripts/generate.py  (from contracts/python)
#
# Editing this by hand fails the codegen reproducibility check.
# These models are ergonomics only. Validation authority is tattoo_contracts.validation.

from __future__ import annotations

from enum import Enum, StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class State(StrEnum):
    queued = 'queued'
    running = 'running'
    succeeded = 'succeeded'
    failed = 'failed'
    cancelled = 'cancelled'


class MimeType(StrEnum):
    image_png = 'image/png'
    image_svg_xml = 'image/svg+xml'
    application_pdf = 'application/pdf'


class Asset(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    assetId: Annotated[str, Field(pattern='^[a-f0-9]{32}$')]
    designId: Annotated[str, Field(pattern='^[a-f0-9]{64}$')]
    mimeType: MimeType


class Size(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    widthMm: Annotated[float, Field(ge=5.0, le=600.0)]
    heightMm: Annotated[float, Field(ge=5.0, le=600.0)]


class BackgroundKind(StrEnum):
    own_photo = 'own_photo'
    generated_anatomy = 'generated_anatomy'


class Method(Enum):
    geometric_multiply = 'geometric-multiply'
    fresh_ink_composite = 'fresh-ink-composite'


class SourceCropPx(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    left: Annotated[int, Field(ge=0)]
    top: Annotated[int, Field(ge=0)]
    width: Annotated[int, Field(ge=1)]
    height: Annotated[int, Field(ge=1)]


class Transform(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    xPx: Annotated[int, Field(ge=0)]
    yPx: Annotated[int, Field(ge=0)]
    widthPx: Annotated[int, Field(ge=0)]
    heightPx: Annotated[int, Field(ge=0)]
    method: Method
    curvature: Annotated[
        float | None,
        Field(
            description='Approximate cylindrical warp in radians, not inferred anatomy.',
            ge=0.0,
            le=1.2,
        ),
    ] = None
    taper: Annotated[
        float | None,
        Field(
            description='Illustrative narrowing towards the lower calf, not measured anatomy.',
            ge=0.0,
            le=0.35,
        ),
    ] = None
    scaleCalibrated: bool
    generativePostprocess: Literal[False]
    sourceCropPx: SourceCropPx | None = None
    surface: Annotated[
        float | None,
        Field(
            description="How strongly the ink is attenuated where the photograph's own shading says the body turns away. An illustrative approximation of surface form, not recovered depth, and never a displacement: the artwork's geometry is authoritative (ADR-0014, MOCKUP-INV-001).",
            ge=0.0,
            le=1.0,
        ),
    ] = None
    freshness: Annotated[
        float | None,
        Field(
            description='Strength of the fresh-ink reddening around the strokes. 0 when the render is a plain multiply. Illustrative, never a clinical prediction of healing (PROD-INV-003).',
            ge=0.0,
            le=4.0,
        ),
    ] = None


class Coverage(Enum):
    larger = 'larger'
    smaller = 'smaller'
    full = 'full'


class Mode(Enum):
    artwork = 'artwork'
    placement = 'placement'


class Edit(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    parentJobId: Annotated[str, Field(pattern='^[a-f0-9]{32}$')]
    instruction: Annotated[str, Field(max_length=1000, min_length=3)]
    coverage: Coverage | None = None
    mode: Mode | None = None


class Artifact(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    designId: Annotated[str, Field(pattern='^[a-f0-9]{64}$')]
    briefId: Annotated[str, Field(pattern='^[a-f0-9-]{36}$')]
    briefRevision: Annotated[int, Field(ge=1)]
    size: Size
    master: Asset
    stencil: Asset
    stencilMirror: Asset
    pdf: Asset
    pdfMirror: Asset
    mockup: Asset
    referenceAnalysis: Annotated[str, Field(max_length=3000, min_length=1)]
    reviewRequired: Literal[True]
    backgroundKind: BackgroundKind
    transform: Transform
    notice: Annotated[str, Field(min_length=1)]
    background: Asset | None = None
    edit: Edit | None = None


class StudioJobStatus(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    jobId: Annotated[str, Field(pattern='^[a-f0-9]{32}$')]
    state: State
    result: Artifact | None
    error: str | None
