"""The flash render path end to end, against the fixture provider.

Nothing here touches a network. What it proves is that a valid brief becomes a valid
`Design`, that lineage behaves, and that failures surface as flash errors rather than
provider internals.

What it cannot prove is that the artwork is any good.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from tattoo_contracts import is_valid_design

from flash import BriefIncompleteError, FlashEngine, RenderFailedError, RenderOptions
from flash.engine import DESIGN_SCHEMA_VERSION
from generation import ContentPolicyRejectionError, FixtureProvider, RetryPolicy

from .conftest import InMemoryDesignStore, load_brief


class _Store:
    """Minimal media store for the fixture provider."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put(self, data: bytes, *, media_type: str, width_px: int, height_px: int, hint: str) -> Any:
        from generation import ImageRef

        key = f"{hint}/{len(self.objects):04d}"
        self.objects[key] = data
        return ImageRef(
            storage_key=key,
            media_type=media_type,  # type: ignore[arg-type]
            width_px=width_px,
            height_px=height_px,
            byte_size=len(data),
        )


def _engine(design_store: InMemoryDesignStore, provider: Any = None) -> FlashEngine:
    ids = iter(f"{i:08x}-0000-4000-8000-000000000000" for i in range(1, 100))
    return FlashEngine(
        provider or FixtureProvider(_Store(), retry_policy=RetryPolicy(max_attempts=1)),
        design_store,
        new_id=lambda: next(ids),
        clock=lambda: "2026-09-19T12:00:00Z",
    )


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def test_renders_a_valid_design(brief: dict[str, Any], design_store: InMemoryDesignStore) -> None:
    design = _engine(design_store).render_flash(brief)

    assert is_valid_design(design), design
    assert design["schemaVersion"] == DESIGN_SCHEMA_VERSION
    assert design["kind"] == "flash"
    assert design["status"] == "draft"
    assert design["version"] == 1
    assert "parentDesignId" not in design


def test_design_records_the_brief_revision(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """CONTRACTS-INV-003: a design is only meaningful against the revision behind it."""
    brief["revision"] = 7

    design = _engine(design_store).render_flash(brief)

    assert design["briefId"] == brief["briefId"]
    assert design["briefRevision"] == 7


def test_design_records_reproducible_provenance(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    design = _engine(design_store).render_flash(brief)

    provenance = design["provenance"]
    assert provenance["provider"] == "fixture"
    assert provenance["model"]
    assert provenance["prompt"]
    assert provenance["seed"] is not None


def test_render_is_persisted(brief: dict[str, Any], design_store: InMemoryDesignStore) -> None:
    design = _engine(design_store).render_flash(brief)

    assert design_store.get(design["designId"]) == design


def test_raster_matches_the_brief_proportions(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """FLASH-INV-003, checked on the actual produced artifact rather than the plan."""
    from flash import raster_size_for

    design = _engine(design_store).render_flash(brief)
    expected = raster_size_for(brief["size"]["widthMm"], brief["size"]["heightMm"])

    assert (design["image"]["widthPx"], design["image"]["heightPx"]) == expected


def test_design_carries_no_millimetres(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """CONTRACTS-INV-001: physical size has exactly one home, and it is the brief."""
    design = _engine(design_store).render_flash(brief)

    assert "Mm" not in repr(design["image"])
    assert "size" not in design


def test_storage_key_is_opaque(brief: dict[str, Any], design_store: InMemoryDesignStore) -> None:
    design = _engine(design_store).render_flash(brief)

    assert "://" not in design["image"]["storageKey"]


def test_render_does_not_mutate_the_brief(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    before = copy.deepcopy(brief)

    _engine(design_store).render_flash(brief)

    assert brief == before


def test_options_select_the_model(brief: dict[str, Any], design_store: InMemoryDesignStore) -> None:
    design = _engine(design_store).render_flash(brief, RenderOptions(model="some/other-model"))

    assert design["provenance"]["model"] == "some/other-model"


def test_same_seed_and_brief_reproduce_the_same_image(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    store = _Store()
    provider = FixtureProvider(store, retry_policy=RetryPolicy(max_attempts=1))
    engine = _engine(design_store, provider)

    first = engine.render_flash(brief, RenderOptions(seed=11))
    second = engine.render_flash(brief, RenderOptions(seed=11))

    assert (
        store.objects[first["image"]["storageKey"]] == store.objects[second["image"]["storageKey"]]
    )


# ---------------------------------------------------------------------------
# FLASH-INV-002: refinement produces a new version, never a mutation
# ---------------------------------------------------------------------------


def test_refine_produces_the_next_version(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    engine = _engine(design_store)
    first = engine.render_flash(brief)

    second = engine.refine_flash(first, brief, "make the linework heavier")

    assert second["version"] == 2
    assert second["parentDesignId"] == first["designId"]
    assert second["designId"] != first["designId"]
    assert is_valid_design(second)


def test_refine_does_not_mutate_the_original(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    engine = _engine(design_store)
    first = engine.render_flash(brief)
    snapshot = copy.deepcopy(first)

    engine.refine_flash(first, brief, "make the linework heavier")

    assert first == snapshot


def test_both_versions_remain_retrievable(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """A user comparing iterations needs the earlier one to still exist."""
    engine = _engine(design_store)
    first = engine.render_flash(brief)

    second = engine.refine_flash(first, brief, "heavier linework")

    assert design_store.get(first["designId"]) is not None
    assert design_store.get(second["designId"]) is not None


def test_refinement_text_reaches_the_prompt(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    engine = _engine(design_store)
    first = engine.render_flash(brief)

    second = engine.refine_flash(first, brief, "heavier linework please")

    assert "heavier linework please" in second["provenance"]["prompt"]


def test_refinement_is_screened_for_mimicry(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """The refinement field is free text and is another smuggling route."""
    engine = _engine(design_store)
    first = engine.render_flash(brief)

    second = engine.refine_flash(first, brief, "redo it in the style of Sailor Jerry")

    assert "style of" not in second["provenance"]["prompt"].lower()


def test_empty_refinement_is_rejected(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    engine = _engine(design_store)
    first = engine.render_flash(brief)

    with pytest.raises(BriefIncompleteError):
        engine.refine_flash(first, brief, "   ")


def test_chained_refinements_keep_incrementing(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    engine = _engine(design_store)
    v1 = engine.render_flash(brief)
    v2 = engine.refine_flash(v1, brief, "heavier")
    v3 = engine.refine_flash(v2, brief, "darker")

    assert [v1["version"], v2["version"], v3["version"]] == [1, 2, 3]
    assert v3["parentDesignId"] == v2["designId"]


# ---------------------------------------------------------------------------
# Failure handling
# ---------------------------------------------------------------------------


def test_invalid_brief_is_refused_before_generating(design_store: InMemoryDesignStore) -> None:
    broken = load_brief()
    broken["style"]["primary"] = "not_a_real_style"

    with pytest.raises(BriefIncompleteError):
        _engine(design_store).render_flash(broken)

    assert design_store.designs == {}


def test_generation_failure_surfaces_as_a_flash_error(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """Callers should not have to catch provider exceptions from a module they did not call."""

    class Refusing(FixtureProvider):
        def _text_to_image(self, request: Any) -> Any:
            raise ContentPolicyRejectionError("refused", provider="fixture")

    engine = _engine(design_store, Refusing(_Store(), retry_policy=RetryPolicy(max_attempts=1)))

    with pytest.raises(RenderFailedError):
        engine.render_flash(brief)

    assert design_store.designs == {}


def test_plan_for_does_not_generate(
    brief: dict[str, Any], design_store: InMemoryDesignStore
) -> None:
    """Prompt review and cost estimation must not cost a generation."""

    class Exploding(FixtureProvider):
        def _text_to_image(self, request: Any) -> Any:
            raise AssertionError("should not have generated")

    engine = _engine(design_store, Exploding(_Store()))

    plan = engine.plan_for(brief)

    assert plan.prompt
    assert design_store.designs == {}
