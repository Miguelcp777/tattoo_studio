from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from generation.studio import StudioProvider


def test_missing_credentials_never_creates_fixture() -> None:
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        StudioProvider("")


def test_proposal_edit_sends_master_first_and_change_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = StudioProvider("test-not-a-secret")
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(provider.client, "post", lambda url, **kw: calls.append(kw))
    monkeypatch.setattr(provider, "image_bytes", lambda response: b"edited")
    result = provider.edit_artwork(
        {"size": {"widthMm": 80, "heightMm": 150}},
        b"master",
        [b"reference"],
        "Escudo más pequeño",
        rendered=True,
    )
    assert result == b"edited"
    assert [entry[1][1] for entry in calls[0]["files"]] == [b"master", b"reference"]
    assert "Escudo más pequeño" in calls[0]["data"]["prompt"]
    assert len(calls) == 1
    provider.close()


def test_reference_bytes_are_in_the_edit_request(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = StudioProvider("test-not-a-secret")
    calls = []

    def post(url: str, **kwargs: Any) -> object:
        calls.append((url, kwargs))
        return object()

    monkeypatch.setattr(provider.client, "post", post)
    monkeypatch.setattr(provider, "image_bytes", lambda response: b"output")
    brief = {"size": {"widthMm": 80, "heightMm": 150}}
    assert provider.lineart(brief, [b"reference-a", b"reference-b"], "visible details") == b"output"
    assert calls[0][0].endswith("/images/edits")
    files = calls[0][1]["files"]
    assert [entry[1][1] for entry in files] == [b"reference-a", b"reference-b"]
    assert "FLAT NATIVE" in calls[0][1]["data"]["prompt"]
    provider.close()


def test_without_references_the_design_is_generated(monkeypatch: pytest.MonkeyPatch) -> None:
    """TASK-0058: the edits endpoint needs an image; a reference-free design is generated."""
    provider = StudioProvider("test-not-a-secret")
    calls = []

    def post(url: str, **kwargs: Any) -> object:
        calls.append((url, kwargs))
        return object()

    monkeypatch.setattr(provider.client, "post", post)
    monkeypatch.setattr(provider, "image_bytes", lambda response: b"output")
    brief = {"size": {"widthMm": 80, "heightMm": 150}}
    assert provider.lineart(brief, [], "Sin referencias") == b"output"
    url, request = calls[0]
    assert url.endswith("/images/generations")
    assert "files" not in request
    prompt = request["json"]["prompt"]
    assert "No reference images are supplied" in prompt
    assert "supplied images are visual references" not in prompt
    assert request["json"]["size"] == "1024x1536"
    provider.close()


@pytest.mark.parametrize("mode", ["colour", "black_and_grey_with_accent"])
def test_colour_request_uses_references_and_optional_palette(
    monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    provider = StudioProvider("test-not-a-secret")
    calls: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> object:
        assert url.endswith("/images/edits")
        calls.append(kwargs)
        return object()

    monkeypatch.setattr(provider.client, "post", post)
    monkeypatch.setattr(provider, "image_bytes", lambda response: b"output")
    brief = {"size": {"widthMm": 80, "heightMm": 150}, "colour": {"mode": mode}}
    assert provider.colour_artwork(brief, [b"reference"], "visible colours") == b"output"
    prompt = calls[0]["data"]["prompt"]
    assert "FLAT COLOUR" in prompt
    assert "If no palette is provided" in prompt
    assert "no shading" not in prompt
    assert calls[0]["files"][0][1][1] == b"reference"
    assert len(calls) == 1
    provider.close()


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1/x", "https://localhost/x", "https://upload.wikimedia.org.evil.test/x"]
)
def test_reference_download_rejects_non_commons_hosts(url: str) -> None:
    provider = StudioProvider("test-not-a-secret")
    with pytest.raises(ValueError, match="Commons"):
        provider.download_reference(url)
    provider.close()


def _zones() -> list[str]:
    import json
    from importlib import resources

    zones = resources.files("tattoo_contracts.reference").joinpath("body-zones.json")
    data = zones.read_text("utf-8")
    return sorted(json.loads(data)["zones"])


def test_every_zone_has_a_camera_view() -> None:
    from generation.studio import ZONE_VIEWS

    assert sorted(ZONE_VIEWS) == _zones()


def test_a_calf_background_is_the_back_of_the_leg() -> None:
    # TASK-0039: "right calf ... frontal view" produced a shin, so a calf tattoo sat on the front
    # of the leg. The view is named, and nothing asks for a frontal view any more.
    prompt = StudioProvider.background_prompt({"placement": {"bodyPart": "calf", "side": "right"}})
    assert "right calf" in prompt
    assert "from directly behind" in prompt
    assert "frontal" not in prompt
    shin = StudioProvider.background_prompt({"placement": {"bodyPart": "shin"}})
    assert "front of the lower leg" in shin


class _Answer:
    def __init__(self, status: int, body: dict[str, Any]) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> dict[str, Any]:
        return self._body


BLOCKED = _Answer(400, {"error": {"code": "moderation_blocked", "message": "rejected"}})


def test_a_refused_plate_is_asked_again_then_without_the_body_sex(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """TASK-0059: a woman's thigh was refused by the safety system; refusals are not billed."""
    provider = StudioProvider("test-not-a-secret")
    prompts: list[str] = []
    answers = [BLOCKED, BLOCKED, _Answer(200, {"data": []})]

    def post(url: str, **kwargs: Any) -> object:
        assert url.endswith("/images/generations")
        prompts.append(kwargs["json"]["prompt"])
        return answers[len(prompts) - 1]

    monkeypatch.setattr(provider.client, "post", post)
    monkeypatch.setattr(provider, "image_bytes", lambda response: b"plate")
    brief = {"placement": {"bodyPart": "thigh_outer", "side": "right", "bodyType": "feminine"}}
    assert provider.background(brief) == b"plate"
    assert len(prompts) == 3
    assert "of a woman" in prompts[0] and "of a woman" in prompts[1]
    assert "of an adult" in prompts[2]
    provider.close()


def test_a_plate_refused_every_time_says_what_to_do(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = StudioProvider("test-not-a-secret")
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> object:
        calls.append(url)
        return BLOCKED

    monkeypatch.setattr(provider.client, "post", post)
    brief = {"placement": {"bodyPart": "thigh_front", "bodyType": "feminine"}}
    with pytest.raises(ValueError, match="Mi foto de piel"):
        provider.background(brief)
    assert len(calls) == 3
    provider.close()


def test_other_provider_errors_are_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = StudioProvider("test-not-a-secret")
    calls: list[str] = []

    def post(url: str, **kwargs: Any) -> object:
        calls.append(url)
        return _Answer(400, {"error": {"code": "invalid_value"}})

    monkeypatch.setattr(provider.client, "post", post)
    with pytest.raises(ValueError, match="400"):
        provider.background({"placement": {"bodyPart": "calf"}})
    assert len(calls) == 1
    provider.close()


def test_the_plate_is_a_clothed_clinical_record() -> None:
    prompt = StudioProvider.background_prompt(
        {"placement": {"bodyPart": "thigh_front", "side": "right", "bodyType": "feminine"}}
    )
    assert "Clinical reference photograph of the skin of the right front of the thigh" in prompt
    assert "clothing covers the body outside this zone" in prompt
    assert "bare" not in prompt


def test_background_names_the_body_sex_when_given() -> None:
    """TASK-0041: the plate reads as a man's or a woman's leg; unset stays a neutral adult."""
    man = StudioProvider.background_prompt(
        {"placement": {"bodyPart": "calf", "side": "right", "bodyType": "masculine"}}
    )
    woman = StudioProvider.background_prompt(
        {"placement": {"bodyPart": "calf", "bodyType": "feminine"}}
    )
    neutral = StudioProvider.background_prompt({"placement": {"bodyPart": "calf"}})
    assert "of a man" in man and "of a woman" in woman and "of an adult" in neutral
    # Never leaks into a value the artwork prompt would read.
    assert "bodyType" not in man


def test_a_paid_image_call_is_recorded_with_its_usage(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """TASK-0054: the provider's own method meters itself, with what OpenAI reported."""
    import base64 as b64
    from datetime import UTC, datetime, timedelta

    from telemetry import activity, configure
    from telemetry.store import EventStore, sqlite_store

    store = sqlite_store(tmp_path / "t.sqlite", start=False)
    configure(store)

    class Answer:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {
                "data": [{"b64_json": b64.b64encode(b"png").decode()}],
                "usage": {"input_tokens": 40, "output_tokens": 1600},
            }

    provider = StudioProvider("test-not-a-secret")
    monkeypatch.setattr(provider.client, "post", lambda url, **kw: Answer())
    monkeypatch.setattr(provider, "accept_output", lambda data: data)
    try:
        with activity("11111111-1111-4111-8111-111111111111", "job-7"):
            provider.background({"placement": {"bodyPart": "forearm"}})
        (event,) = store.events(datetime.now(UTC) - timedelta(hours=1))
    finally:
        configure(EventStore(lambda: None, style="sqlite", start=False))
        provider.close()

    assert (event["provider"], event["operation"], event["model"]) == (
        "openai",
        "background",
        provider.image_model,
    )
    assert (event["input_tokens"], event["output_tokens"], event["images"]) == (40, 1600, 1)
    assert (event["account"], event["job"], event["outcome"]) == (
        "11111111-1111-4111-8111-111111111111",
        "job-7",
        "ok",
    )
