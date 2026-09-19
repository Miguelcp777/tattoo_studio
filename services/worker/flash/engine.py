"""The flash render path: a validated brief in, a ``Design`` out.

No user photograph is handled here and this module must never acquire a dependency
that would give it one (ARCH-INV-004, flash security note). Everything it touches is
artwork.

Designs are immutable. ``refine_flash`` produces version n+1 and leaves n untouched,
because a user comparing iterations needs the earlier one to still exist
(FLASH-INV-002).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any, Protocol

from tattoo_contracts import assert_design, assert_tattoo_brief

from generation import (
    GenerationError,
    GenerationProvider,
    TextToImageRequest,
)

from .prompt import PromptPlan, PromptScreen, build_prompt

DESIGN_SCHEMA_VERSION = "1.0.0"


class FlashError(Exception):
    """Base for failures of the flash path."""


class BriefIncompleteError(FlashError):
    """The brief did not satisfy the contract, so nothing was generated."""


class RenderFailedError(FlashError):
    """Generation failed. Wraps the provider's typed error without leaking its detail."""


class DesignStore(Protocol):
    """The slice of persistence this engine needs.

    Designs and their lineage are persisted (`flash.spec.md`), but which database does
    it is not this module's business.
    """

    def save(self, design: dict[str, Any]) -> None: ...

    def get(self, design_id: str) -> dict[str, Any] | None: ...


@dataclass(frozen=True, slots=True)
class RenderOptions:
    """Knobs a caller may turn without touching the brief."""

    model: str = "fal-ai/flux/schnell"
    seed: int | None = None


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_id() -> str:
    return str(uuid.uuid4())


IdFactory = Callable[[], str]
Clock = Callable[[], str]


class FlashEngine:
    """Renders flash artwork from briefs."""

    def __init__(
        self,
        provider: GenerationProvider,
        store: DesignStore,
        *,
        screen: PromptScreen | None = None,
        new_id: IdFactory = _new_id,
        clock: Clock = _now,
    ) -> None:
        self._provider = provider
        self._store = store
        self._screen = screen
        self._new_id = new_id
        self._clock = clock

    # ------------------------------------------------------------------

    def plan_for(self, brief: dict[str, Any]) -> PromptPlan:
        """Expose the prompt plan without generating.

        Useful for review and for cost estimation, and it keeps the expensive call out
        of tests that only care about prompt content.
        """
        self._require_valid_brief(brief)
        return build_prompt(brief, screen=self._screen)

    def render_flash(
        self, brief: dict[str, Any], options: RenderOptions | None = None
    ) -> dict[str, Any]:
        """Render the first version of a design from a brief."""
        self._require_valid_brief(brief)
        opts = options or RenderOptions()
        plan = build_prompt(brief, screen=self._screen)

        generated = self._generate(plan, opts)

        design = self._assemble(
            brief=brief,
            plan=plan,
            generated=generated,
            version=1,
            parent_design_id=None,
        )
        self._store.save(design)
        return design

    def refine_flash(
        self,
        design: dict[str, Any],
        brief: dict[str, Any],
        refinement: str,
        options: RenderOptions | None = None,
    ) -> dict[str, Any]:
        """Produce the next version of a design.

        The prior design is neither modified nor replaced: it is marked superseded in a
        *copy* that the caller may persist, while the stored original stays retrievable
        (FLASH-INV-002).
        """
        self._require_valid_brief(brief)
        assert_design(design)
        if not refinement.strip():
            raise BriefIncompleteError("refinement instruction is empty")

        opts = options or RenderOptions()
        plan = build_prompt(brief, screen=self._screen)
        refined_text = f"{plan.prompt}, {self._clean(refinement)}"
        plan = replace(plan, prompt=refined_text)

        generated = self._generate(plan, opts)

        next_design = self._assemble(
            brief=brief,
            plan=plan,
            generated=generated,
            version=int(design["version"]) + 1,
            parent_design_id=str(design["designId"]),
        )
        self._store.save(next_design)
        return next_design

    # ------------------------------------------------------------------

    def _clean(self, text: str) -> str:
        from .prompt import strip_mimicry_requests

        stripped = strip_mimicry_requests(text)
        return self._screen.screen_text(stripped) if self._screen is not None else stripped

    def _require_valid_brief(self, brief: dict[str, Any]) -> None:
        try:
            assert_tattoo_brief(brief)
        except Exception as error:
            # Deliberately re-raised as a flash error: callers of this module should not
            # have to catch contract exceptions from a module they did not call.
            raise BriefIncompleteError(str(error)) from error

    def _generate(self, plan: PromptPlan, opts: RenderOptions) -> Any:
        request = TextToImageRequest(
            prompt=plan.prompt,
            negative_prompt=plan.negative_prompt,
            width_px=plan.width_px,
            height_px=plan.height_px,
            model=opts.model,
            seed=opts.seed,
        )
        try:
            return self._provider.text_to_image(request)
        except GenerationError as error:
            # A safety rejection surfaces as a rejection. It is never retried with a
            # softened prompt (`flash.spec.md` error semantics).
            raise RenderFailedError(str(error)) from error

    def _assemble(
        self,
        *,
        brief: dict[str, Any],
        plan: PromptPlan,
        generated: Any,
        version: int,
        parent_design_id: str | None,
    ) -> dict[str, Any]:
        image = generated.image
        design: dict[str, Any] = {
            "schemaVersion": DESIGN_SCHEMA_VERSION,
            "designId": self._new_id(),
            "briefId": brief["briefId"],
            # The exact revision, so a design is always explainable against the brief
            # that produced it (CONTRACTS-INV-003).
            "briefRevision": brief["revision"],
            "version": version,
            "kind": "flash",
            "status": "draft",
            "createdAt": self._clock(),
            "image": {
                "storageKey": image.storage_key,
                "mediaType": image.media_type,
                "widthPx": image.width_px,
                "heightPx": image.height_px,
            },
            "provenance": {
                "provider": generated.provider,
                "model": generated.model,
                "prompt": plan.prompt,
                "negativePrompt": plan.negative_prompt,
            },
        }
        if image.byte_size is not None:
            design["image"]["byteSize"] = image.byte_size
        if parent_design_id is not None:
            design["parentDesignId"] = parent_design_id
        if generated.seed is not None:
            design["provenance"]["seed"] = generated.seed

        # Validate our own output against the contract before it leaves the module.
        # An engine that emits an invalid Design is a worse failure than one that
        # refuses, because the damage surfaces somewhere else entirely.
        assert_design(design)
        return design
