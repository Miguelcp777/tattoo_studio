"""Flash render path: a validated brief becomes shaded reference artwork.

Handles no user photographs and must never acquire a dependency that would give it
one (ARCH-INV-004).
"""

from .engine import (
    BriefIncompleteError,
    DesignStore,
    FlashEngine,
    FlashError,
    RenderFailedError,
    RenderOptions,
)
from .prompt import (
    PromptPlan,
    PromptScreen,
    UnrenderableAspectError,
    build_prompt,
    raster_size_for,
    strip_mimicry_requests,
)

__all__ = [
    "BriefIncompleteError",
    "DesignStore",
    "FlashEngine",
    "FlashError",
    "PromptPlan",
    "PromptScreen",
    "RenderFailedError",
    "RenderOptions",
    "UnrenderableAspectError",
    "build_prompt",
    "raster_size_for",
    "strip_mimicry_requests",
]
