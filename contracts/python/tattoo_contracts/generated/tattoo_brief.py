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


class Element(RootModel[str]):
    root: Annotated[str, Field(max_length=120, min_length=1)]


class Subject(BaseModel):
    """
    What the tattoo depicts.
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    description: Annotated[str, Field(max_length=2000, min_length=10)]
    elements: Annotated[
        list[Element] | None,
        Field(
            description='Key motifs, kept structured so engines can weight them individually.',
            max_length=20,
        ),
    ] = None


class Weight(Enum):
    """
    Drives the stencil's single-weight linework as much as the flash render.
    """

    fine = 'fine'
    medium = 'medium'
    bold = 'bold'
    mixed = 'mixed'


class Linework(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    weight: Annotated[
        Weight,
        Field(
            description="Drives the stencil's single-weight linework as much as the flash render."
        ),
    ]
    notes: Annotated[str | None, Field(max_length=400)] = None


class Technique(Enum):
    none = 'none'
    whip = 'whip'
    dotwork = 'dotwork'
    smooth_blend = 'smooth_blend'
    solid_fill = 'solid_fill'
    mixed = 'mixed'


class Intensity(Enum):
    light = 'light'
    medium = 'medium'
    heavy = 'heavy'


class Shading(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    technique: Technique
    intensity: Intensity


class Mode(Enum):
    black_and_grey = 'black_and_grey'
    colour = 'colour'
    black_and_grey_with_accent = 'black_and_grey_with_accent'


class PaletteItem(RootModel[str]):
    root: Annotated[str, Field(max_length=40, min_length=1)]


class Colour(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    mode: Mode
    palette: Annotated[
        list[PaletteItem] | None,
        Field(
            description='Only meaningful when ink is used. Forbidden on a pure black-and-grey brief, enforced below.',
            max_length=8,
            min_length=1,
        ),
    ] = None


class Orientation(Enum):
    vertical = 'vertical'
    horizontal = 'horizontal'
    diagonal = 'diagonal'
    wrapping = 'wrapping'


class Side(Enum):
    left = 'left'
    right = 'right'
    centre = 'centre'


class AvoidItem(RootModel[str]):
    root: Annotated[str, Field(max_length=120, min_length=1)]


class Constraints(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    coverUp: Annotated[
        bool | None,
        Field(
            description='Covering existing work constrains density and darkness heavily.'
        ),
    ] = None
    avoid: Annotated[list[AvoidItem] | None, Field(max_length=20)] = None


class StyleName(Enum):
    """
    The closed curated vocabulary from product-behavior.spec.md (CONTRACTS-INV-002). Free-text style input is mapped onto this list by the consultation, never passed through raw.
    """

    american_traditional = 'american_traditional'
    fine_line = 'fine_line'
    black_and_grey_realism = 'black_and_grey_realism'
    neo_traditional = 'neo_traditional'
    irezumi = 'irezumi'
    blackwork = 'blackwork'
    illustrative = 'illustrative'
    ornamental = 'ornamental'
    lettering = 'lettering'
    surrealism = 'surrealism'


class BodyPart(Enum):
    """
    Curated anatomical placements. Several of these are torso areas whose reference photographs are sensitive personal data; see quality-and-security.spec.md.
    """

    inner_forearm = 'inner_forearm'
    outer_forearm = 'outer_forearm'
    upper_arm_inner = 'upper_arm_inner'
    upper_arm_outer = 'upper_arm_outer'
    shoulder = 'shoulder'
    collarbone = 'collarbone'
    chest = 'chest'
    sternum = 'sternum'
    ribs = 'ribs'
    stomach = 'stomach'
    upper_back = 'upper_back'
    lower_back = 'lower_back'
    spine = 'spine'
    hip = 'hip'
    thigh_front = 'thigh_front'
    thigh_outer = 'thigh_outer'
    calf = 'calf'
    shin = 'shin'
    ankle = 'ankle'
    foot = 'foot'
    wrist_inner = 'wrist_inner'
    wrist_outer = 'wrist_outer'
    hand = 'hand'
    finger = 'finger'
    neck = 'neck'
    behind_ear = 'behind_ear'


class Millimetres(RootModel[float]):
    root: Annotated[
        float,
        Field(
            description="Bounded to what is physically plausible: smaller than 5mm will not hold detail, larger than 600mm exceeds a single sitting's placement.",
            ge=5.0,
            le=600.0,
        ),
    ]


class Style(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    primary: StyleName
    secondary: StyleName | None = None
    notes: Annotated[
        str | None,
        Field(
            description='Free text for nuance within a style. Never a route around the closed vocabulary, and never a place to name a living artist (PROD-INV-004, enforced by the safety module).',
            max_length=600,
        ),
    ] = None


class Placement(BaseModel):
    """
    Where on the body. Embedded rather than extracted into its own schema until a second consumer exists (TASK-0002/DEC-004).
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    bodyPart: BodyPart
    orientation: Orientation
    side: Side | None = None


class Size(BaseModel):
    """
    Millimetres are authoritative. No pixel dimension appears anywhere in this contract (CONTRACTS-INV-001).
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    widthMm: Millimetres
    heightMm: Millimetres


class TattooBrief(BaseModel):
    """
    The system's central contract. The consultation produces it; the flash, stencil and mockup engines consume it. Size is authoritative in millimetres (CONTRACTS-INV-001) and style is drawn from a closed vocabulary (CONTRACTS-INV-002). No 'format' keyword is used and every pattern spells out [0-9], so that TypeScript and Python reach identical verdicts.
    """

    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: Annotated[
        Literal['1.0.0'],
        Field(
            description='Fixed for this schema revision. A breaking change bumps it and carries a migration (CONTRACTS-INV-004).'
        ),
    ]
    briefId: Annotated[
        str,
        Field(
            description="Canonical lowercase UUID. Uses a pattern rather than 'format' so both runtimes assert it.",
            pattern='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
    ]
    revision: Annotated[
        int,
        Field(
            description='Increments on every accepted change. A Design records the revision that produced it (CONTRACTS-INV-003).',
            ge=1,
        ),
    ]
    createdAt: Annotated[
        str,
        Field(
            description='RFC 3339 timestamp. ASCII digits only, so Python and JavaScript agree.',
            pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$',
        ),
    ]
    subject: Annotated[Subject, Field(description='What the tattoo depicts.')]
    style: Style
    linework: Linework
    shading: Shading
    colour: Colour
    placement: Annotated[
        Placement,
        Field(
            description='Where on the body. Embedded rather than extracted into its own schema until a second consumer exists (TASK-0002/DEC-004).'
        ),
    ]
    size: Annotated[
        Size,
        Field(
            description='Millimetres are authoritative. No pixel dimension appears anywhere in this contract (CONTRACTS-INV-001).'
        ),
    ]
    constraints: Constraints | None = None
