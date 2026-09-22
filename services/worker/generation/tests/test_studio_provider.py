from __future__ import annotations

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
