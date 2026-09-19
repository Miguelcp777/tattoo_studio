# GENERATED FILE - DO NOT EDIT.
#
# Source: contracts/schemas/
# Regenerate: uv run python scripts/generate.py  (from contracts/python)
#
# Editing this by hand fails the codegen reproducibility check.
# These models are ergonomics only. Validation authority is tattoo_contracts.validation.

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Kind(Enum):
    """
    Which pass produced this artwork. 'flash' is the shaded reference render; 'line_art' is the dedicated stencil pass, which is generated natively rather than edge-detected from flash (ADR-0003).
    """

    flash = 'flash'
    line_art = 'line_art'


class Status(Enum):
    draft = 'draft'
    accepted = 'accepted'
    superseded = 'superseded'


class Provenance(BaseModel):
    """
    What produced this artwork. Kept so a design can be explained, reproduced and audited.
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    provider: Annotated[
        str,
        Field(
            description='Adapter name, not a credential or endpoint.',
            max_length=60,
            min_length=1,
        ),
    ]
    model: Annotated[str, Field(max_length=200, min_length=1)]
    prompt: Annotated[str, Field(max_length=4000, min_length=1)]
    negativePrompt: Annotated[str | None, Field(max_length=2000)] = None
    seed: Annotated[
        int | None,
        Field(
            description='Recorded when the provider exposes one, so a render can be reproduced.',
            ge=0,
        ),
    ] = None


class Uuid(RootModel[str]):
    root: Annotated[
        str,
        Field(
            description="Canonical lowercase UUID. A pattern rather than 'format', so both runtimes assert it.",
            pattern='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
    ]


class Timestamp(RootModel[str]):
    root: Annotated[
        str,
        Field(
            description='RFC 3339. ASCII digits only, so Python and JavaScript agree.',
            pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$',
        ),
    ]


class MediaType(Enum):
    image_png = 'image/png'
    image_webp = 'image/webp'
    image_jpeg = 'image/jpeg'


class Pixels(RootModel[int]):
    root: Annotated[
        int,
        Field(
            description="Raster dimensions of this stored image. These describe the artifact, not the tattoo: the tattoo's authoritative size is in millimetres on the brief, and nothing derives physical size from these (CONTRACTS-INV-001).",
            ge=1,
            le=16384,
        ),
    ]


class ImageRef(BaseModel):
    """
    A handle to stored image bytes. Bytes themselves never cross a module boundary or travel through the queue (JOBS-INV-001).
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    storageKey: Annotated[
        str,
        Field(
            description='Opaque key into media storage. Never a signed or public URL (SEC-INV-008).',
            max_length=512,
            min_length=1,
            pattern='^[A-Za-z0-9._/-]+$',
        ),
    ]
    mediaType: MediaType
    widthPx: Pixels
    heightPx: Pixels
    byteSize: Annotated[int | None, Field(ge=1)] = None


class Design(BaseModel):
    """
    A generated artwork and its lineage. Produced by the flash engine from a TattooBrief, consumed by the stencil and mockup engines. Records the brief revision that produced it (CONTRACTS-INV-003). Follows the same conventions as TattooBrief: no 'format' keyword, and every pattern spells out [0-9], so TypeScript and Python reach identical verdicts.
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: Annotated[
        Literal['1.0.0'],
        Field(description='Fixed for this schema revision (CONTRACTS-INV-004).'),
    ]
    designId: Uuid
    briefId: Annotated[
        Uuid, Field(description='The brief this design was rendered from.')
    ]
    briefRevision: Annotated[
        int,
        Field(
            description='The exact brief revision used. A design is only meaningful against the revision that produced it (CONTRACTS-INV-003).',
            ge=1,
        ),
    ]
    version: Annotated[
        int,
        Field(
            description='Design version within its lineage. Refinement produces version n+1 and never mutates n (FLASH-INV-002).',
            ge=1,
        ),
    ]
    parentDesignId: Annotated[
        Uuid | None,
        Field(
            description='The design this one was refined from. Absent on a first render.'
        ),
    ] = None
    kind: Annotated[
        Kind,
        Field(
            description="Which pass produced this artwork. 'flash' is the shaded reference render; 'line_art' is the dedicated stencil pass, which is generated natively rather than edge-detected from flash (ADR-0003)."
        ),
    ]
    status: Status
    createdAt: Timestamp
    image: ImageRef
    provenance: Annotated[
        Provenance,
        Field(
            description='What produced this artwork. Kept so a design can be explained, reproduced and audited.'
        ),
    ]
