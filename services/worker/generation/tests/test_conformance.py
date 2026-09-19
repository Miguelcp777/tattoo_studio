"""The conformance suite every adapter must pass.

One suite, parametrised over every adapter in the repository. Adding a provider means
adding it to ``adapters()`` below; if it does not behave like the others, this fails.
That is the contract ADR-0001 relies on when it claims provider choice is reversible.

The fal adapter runs against a scripted transport here. That proves its request
construction, response normalization and error mapping — **not** that fal returns
usable artwork, which no offline test can show.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator

import pytest

from generation import (
    FalProvider,
    FixtureProvider,
    GenerationProvider,
    ImageConditionedRequest,
    ImageRef,
    InvalidGenerationParametersError,
    RetryPolicy,
    SafetyClearance,
    SafetyGateUnavailableError,
    TextToImageRequest,
)

from .conftest import InMemoryMediaStore, RecordingTransport, fal_success

AdapterFactory = Callable[[InMemoryMediaStore], GenerationProvider]


def _fixture_adapter(store: InMemoryMediaStore) -> GenerationProvider:
    return FixtureProvider(store, retry_policy=RetryPolicy(max_attempts=1), sleep=lambda _s: None)


def _fal_adapter(store: InMemoryMediaStore) -> GenerationProvider:
    transport = RecordingTransport(
        post_responses=[fal_success() for _ in range(6)],
        get_responses=[type(fal_success())(status_code=200, content=b"PNGDATA") for _ in range(6)],
    )
    return FalProvider(
        api_key="test-key-not-real",
        media_store=store,
        transport=transport,
        retry_policy=RetryPolicy(max_attempts=1),
        sleep=lambda _s: None,
    )


ADAPTERS: dict[str, AdapterFactory] = {
    "fixture": _fixture_adapter,
    "fal": _fal_adapter,
}


@pytest.fixture(params=sorted(ADAPTERS), ids=sorted(ADAPTERS))
def adapter(request: pytest.FixtureRequest) -> Iterator[GenerationProvider]:
    store = InMemoryMediaStore()
    yield ADAPTERS[request.param](store)


def _request(**overrides: object) -> TextToImageRequest:
    base: dict[str, object] = {
        "prompt": "american traditional snake and dagger, flat artwork",
        "width_px": 512,
        "height_px": 768,
        "model": "fal-ai/flux/schnell",
    }
    base.update(overrides)
    return TextToImageRequest(**base)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# What every adapter must do
# ---------------------------------------------------------------------------


def test_returns_a_normalized_result(adapter: GenerationProvider) -> None:
    result = adapter.text_to_image(_request())

    assert result.provider == adapter.name
    assert result.image.storage_key
    assert result.image.width_px > 0
    assert result.image.height_px > 0
    assert result.prompt


def test_result_carries_an_opaque_key_not_a_url(adapter: GenerationProvider) -> None:
    """SEC-INV-008: a provider location must never reach a domain object."""
    result = adapter.text_to_image(_request())

    assert "://" not in result.image.storage_key
    assert not result.image.storage_key.lower().startswith("http")


def test_rejects_an_empty_prompt(adapter: GenerationProvider) -> None:
    with pytest.raises(InvalidGenerationParametersError):
        adapter.text_to_image(_request(prompt="   "))


def test_rejects_an_absurd_dimension(adapter: GenerationProvider) -> None:
    with pytest.raises(InvalidGenerationParametersError):
        adapter.text_to_image(_request(width_px=99999))


def test_rejects_a_zero_dimension(adapter: GenerationProvider) -> None:
    with pytest.raises(InvalidGenerationParametersError):
        adapter.text_to_image(_request(height_px=0))


def test_rejects_an_empty_model(adapter: GenerationProvider) -> None:
    with pytest.raises(InvalidGenerationParametersError):
        adapter.text_to_image(_request(model=""))


def test_records_the_model_it_used(adapter: GenerationProvider) -> None:
    """Design provenance needs this to be reproducible and auditable."""
    result = adapter.text_to_image(_request(model="fal-ai/flux/schnell"))

    assert result.model == "fal-ai/flux/schnell"


# ---------------------------------------------------------------------------
# Fail-closed photo path (GEN-INV-003, SEC-INV-007)
# ---------------------------------------------------------------------------


def _conditioned() -> ImageConditionedRequest:
    return ImageConditionedRequest(
        prompt="blend into skin",
        source=ImageRef(storage_key="photos/x", media_type="image/png", width_px=10, height_px=10),
        strength=0.2,
        model="whatever",
    )


def test_safety_clearance_cannot_be_constructed() -> None:
    """Fail-closed is a property of the type, not of a deletable runtime branch.

    The type moved to the `safety` module in TASK-0012, which is its proper owner. It now
    refuses construction with PermissionError rather than being unconstructable for lack
    of a gate; the guarantee this test cares about is unchanged.
    """
    with pytest.raises(PermissionError):
        SafetyClearance(content_sha256="0" * 64, gate_version="forged", reason_code="ok")


def test_image_to_image_refuses_without_clearance(adapter: GenerationProvider) -> None:
    with pytest.raises(SafetyGateUnavailableError):
        adapter.image_to_image(_conditioned(), clearance=object())  # type: ignore[arg-type]


def test_inpaint_refuses_without_clearance(adapter: GenerationProvider) -> None:
    with pytest.raises(SafetyGateUnavailableError):
        adapter.inpaint(_conditioned(), clearance=object())  # type: ignore[arg-type]


def test_refused_photo_call_issues_no_request() -> None:
    """The gate must deny before anything leaves the process.

    A refusal that still sent the photo would satisfy the type checker and violate
    SEC-INV-007 completely.
    """
    store = InMemoryMediaStore()
    transport = RecordingTransport()
    provider = FalProvider(
        api_key="test-key-not-real",
        media_store=store,
        transport=transport,
        retry_policy=RetryPolicy(max_attempts=1),
        sleep=lambda _s: None,
    )

    with pytest.raises(SafetyGateUnavailableError):
        provider.image_to_image(_conditioned(), clearance=object())  # type: ignore[arg-type]

    assert transport.calls == []
