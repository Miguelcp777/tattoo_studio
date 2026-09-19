"""fal adapter behaviour: request construction, error mapping, retry and leakage.

Everything here runs against a scripted transport. It proves the adapter handles what
fal's documentation says fal returns. It does **not** prove fal returns that, and it
does not prove the artwork is any good — both need a real credential.
"""

from __future__ import annotations

import logging

import pytest

from generation import (
    ContentPolicyRejectionError,
    FalProvider,
    InvalidGenerationParametersError,
    MalformedProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitedError,
    RetryPolicy,
    TextToImageRequest,
)

from .conftest import FakeResponse, InMemoryMediaStore, RecordingTransport, fal_success

SECRET = "fal-key-shhh-do-not-log-me-9f3c"


def _provider(
    transport: RecordingTransport,
    store: InMemoryMediaStore,
    sleeps: list[float] | None = None,
    attempts: int = 3,
) -> FalProvider:
    return FalProvider(
        api_key=SECRET,
        media_store=store,
        transport=transport,
        retry_policy=RetryPolicy(max_attempts=attempts, base_delay_seconds=0.01),
        sleep=(sleeps.append if sleeps is not None else (lambda _s: None)),
    )


def _request(**overrides: object) -> TextToImageRequest:
    base: dict[str, object] = {
        "prompt": "fine line mountain range, flat artwork, transparent background",
        "width_px": 512,
        "height_px": 768,
        "model": "fal-ai/flux/schnell",
    }
    base.update(overrides)
    return TextToImageRequest(**base)  # type: ignore[arg-type]


def _image_body() -> FakeResponse:
    return FakeResponse(status_code=200, content=b"\x89PNG-bytes")


# ---------------------------------------------------------------------------
# Request construction
# ---------------------------------------------------------------------------


def test_posts_to_the_model_endpoint_with_key_auth(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[fal_success()], get_responses=[_image_body()])

    _provider(transport, media_store).text_to_image(_request())

    verb, url = transport.calls[0]
    assert verb == "POST"
    assert url == "https://fal.run/fal-ai/flux/schnell"
    assert transport.last_post_headers["Authorization"] == f"Key {SECRET}"


def test_sends_image_size_and_optional_fields(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[fal_success()], get_responses=[_image_body()])

    _provider(transport, media_store).text_to_image(
        _request(seed=99, negative_prompt="no skin, no background")
    )

    body = transport.last_post_json
    assert body["image_size"] == {"width": 512, "height": 768}
    assert body["seed"] == 99
    assert body["negative_prompt"] == "no skin, no background"


def test_omits_optional_fields_when_unset(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[fal_success()], get_responses=[_image_body()])

    _provider(transport, media_store).text_to_image(_request())

    assert "seed" not in transport.last_post_json
    assert "negative_prompt" not in transport.last_post_json


def test_stores_downloaded_bytes_and_returns_a_key(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[fal_success()], get_responses=[_image_body()])

    result = _provider(transport, media_store).text_to_image(_request())

    assert media_store.objects[result.image.storage_key] == b"\x89PNG-bytes"
    assert result.seed == 4242


def test_prefers_provider_reported_dimensions(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(
        post_responses=[fal_success(width=640, height=960)], get_responses=[_image_body()]
    )

    result = _provider(transport, media_store).text_to_image(_request())

    assert (result.image.width_px, result.image.height_px) == (640, 960)


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (429, RateLimitedError),
        (400, InvalidGenerationParametersError),
        (422, InvalidGenerationParametersError),
        (401, InvalidGenerationParametersError),
        (403, InvalidGenerationParametersError),
        (408, ProviderTimeoutError),
        (504, ProviderTimeoutError),
        (500, ProviderUnavailableError),
        (502, ProviderUnavailableError),
    ],
)
def test_maps_status_codes_to_typed_errors(
    status: int, expected: type[Exception], media_store: InMemoryMediaStore
) -> None:
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=status)] * 3)

    with pytest.raises(expected):
        _provider(transport, media_store).text_to_image(_request())


def test_nsfw_flag_is_a_policy_rejection(media_store: InMemoryMediaStore) -> None:
    """fal reports moderation in-band with a 200, so status alone is not enough."""
    flagged = fal_success()
    flagged.payload["has_nsfw_concepts"] = [True]
    transport = RecordingTransport(post_responses=[flagged])

    with pytest.raises(ContentPolicyRejectionError):
        _provider(transport, media_store).text_to_image(_request())


@pytest.mark.parametrize(
    "payload",
    [
        {"images": []},
        {"images": "not-a-list"},
        {"images": [{"no_url": True}]},
        {"images": [{"url": ""}]},
        {"nothing": "useful"},
    ],
    ids=["empty", "wrong-type", "no-url", "blank-url", "missing-key"],
)
def test_malformed_payloads_raise_rather_than_returning_partial_results(
    payload: dict[str, object], media_store: InMemoryMediaStore
) -> None:
    """GEN-INV-004: a half-understood response must not escape the module."""
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=200, payload=payload)])

    with pytest.raises(MalformedProviderResponseError):
        _provider(transport, media_store).text_to_image(_request())


def test_non_json_body_raises(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=200, payload=None)])

    with pytest.raises(MalformedProviderResponseError):
        _provider(transport, media_store).text_to_image(_request())


def test_unsupported_content_type_raises(media_store: InMemoryMediaStore) -> None:
    odd = fal_success()
    odd.payload["images"][0]["content_type"] = "image/gif"
    transport = RecordingTransport(post_responses=[odd], get_responses=[_image_body()])

    with pytest.raises(MalformedProviderResponseError):
        _provider(transport, media_store).text_to_image(_request())


def test_empty_image_body_raises(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(
        post_responses=[fal_success()], get_responses=[FakeResponse(status_code=200, content=b"")]
    )

    with pytest.raises(MalformedProviderResponseError):
        _provider(transport, media_store).text_to_image(_request())


# ---------------------------------------------------------------------------
# Retry policy
# ---------------------------------------------------------------------------


def test_transient_failure_is_retried_to_the_cap(media_store: InMemoryMediaStore) -> None:
    sleeps: list[float] = []
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=503)] * 3)

    with pytest.raises(ProviderUnavailableError):
        _provider(transport, media_store, sleeps, attempts=3).text_to_image(_request())

    assert transport.post_count == 3
    assert len(sleeps) == 2  # slept between attempts, not after the last


def test_transient_failure_that_recovers_succeeds(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(
        post_responses=[FakeResponse(status_code=503), fal_success()],
        get_responses=[_image_body()],
    )

    result = _provider(transport, media_store, attempts=3).text_to_image(_request())

    assert transport.post_count == 2
    assert result.image.storage_key


def test_policy_rejection_is_never_retried(media_store: InMemoryMediaStore) -> None:
    """Retrying a moderation decision is arguing with it. Explicitly forbidden."""
    flagged = fal_success()
    flagged.payload["has_nsfw_concepts"] = [True]
    transport = RecordingTransport(post_responses=[flagged, flagged, flagged])

    with pytest.raises(ContentPolicyRejectionError):
        _provider(transport, media_store, attempts=3).text_to_image(_request())

    assert transport.post_count == 1


def test_invalid_parameters_are_never_retried(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=400)] * 3)

    with pytest.raises(InvalidGenerationParametersError):
        _provider(transport, media_store, attempts=3).text_to_image(_request())

    assert transport.post_count == 1


def test_backoff_is_bounded() -> None:
    policy = RetryPolicy(max_attempts=10, base_delay_seconds=1.0, max_delay_seconds=8.0)

    assert policy.delay_for(1) == 1.0
    assert policy.delay_for(2) == 2.0
    assert policy.delay_for(9) == 8.0


# ---------------------------------------------------------------------------
# Credential and location leakage (SEC-INV-008)
# ---------------------------------------------------------------------------


def test_api_key_never_appears_in_an_error_message(media_store: InMemoryMediaStore) -> None:
    transport = RecordingTransport(post_responses=[FakeResponse(status_code=401)])

    with pytest.raises(InvalidGenerationParametersError) as raised:
        _provider(transport, media_store).text_to_image(_request())

    assert SECRET not in str(raised.value)


def test_api_key_never_appears_in_logs(
    media_store: InMemoryMediaStore, caplog: pytest.LogCaptureFixture
) -> None:
    transport = RecordingTransport(post_responses=[fal_success()], get_responses=[_image_body()])

    with caplog.at_level(logging.DEBUG):
        _provider(transport, media_store).text_to_image(_request())

    assert SECRET not in caplog.text


def test_transport_failure_message_carries_no_url(media_store: InMemoryMediaStore) -> None:
    """An OSError from a client can embed the request URL, which may carry a token.

    Runs with a single attempt: a transport failure is transient and would otherwise
    be retried, which is correct behaviour but irrelevant to what this asserts.
    """
    transport = RecordingTransport(post_responses=[OSError("connect to https://fal.run/x?k=leak")])

    with pytest.raises(ProviderUnavailableError) as raised:
        _provider(transport, media_store, attempts=1).text_to_image(_request())

    assert "leak" not in str(raised.value)
    assert "https://" not in str(raised.value)


def test_empty_api_key_is_refused(media_store: InMemoryMediaStore) -> None:
    with pytest.raises(InvalidGenerationParametersError):
        FalProvider(api_key="", media_store=media_store, transport=RecordingTransport())
