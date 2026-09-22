"""TASK-0025: FLUX.2 backend. Scripted transport only; no network, no credential."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

import pytest

from generation.bfl_studio import MAX_INPUT_IMAGES, BflStudioProvider
from generation.studio import StudioProvider

KEY = "bfl-test-not-a-secret"
POLL = "https://api.eu.bfl.ai/v1/get_result?id=abc"
SAMPLE = "https://delivery-eu1.bfl.ai/results/abc/sample.png?sig=x"
BRIEF = {
    "size": {"widthMm": 80, "heightMm": 150},
    "placement": {"bodyPart": "forearm", "side": "left"},
}


class Response:
    def __init__(self, status: int, body: Any = None, content: bytes = b"") -> None:
        self.status_code = status
        self._body = body
        self._content = content

    def json(self) -> Any:
        return self._body

    def iter_bytes(self) -> Any:
        yield self._content


class Script:
    """Records every call and replays scripted poll statuses."""

    def __init__(self, statuses: list[Any], *, submit: Response | None = None) -> None:
        self.posts: list[tuple[str, dict[str, Any]]] = []
        self.gets: list[tuple[str, dict[str, str]]] = []
        self.downloads: list[tuple[str, dict[str, Any]]] = []
        self.statuses = statuses
        self.submit = submit or Response(200, {"id": "abc", "polling_url": POLL})

    def post(self, url: str, **kwargs: Any) -> Response:
        self.posts.append((url, kwargs))
        return self.submit

    def get(self, url: str, **kwargs: Any) -> Response:
        self.gets.append((url, kwargs["headers"]))
        item = self.statuses.pop(0)
        return item if isinstance(item, Response) else Response(200, item)

    @contextmanager
    def stream(self, method: str, url: str, **kwargs: Any) -> Any:
        self.downloads.append((url, kwargs))
        yield Response(200, content=b"png-bytes")


def ready(sample: str = SAMPLE) -> dict[str, Any]:
    return {"status": "Ready", "result": {"sample": sample}}


def make(monkeypatch: pytest.MonkeyPatch, script: Script, **kwargs: Any) -> BflStudioProvider:
    provider = BflStudioProvider("openai-test-not-a-secret", KEY, sleep=lambda _s: None, **kwargs)
    monkeypatch.setattr(provider.client, "post", script.post)
    monkeypatch.setattr(provider.client, "get", script.get)
    monkeypatch.setattr(provider.client, "stream", script.stream)
    monkeypatch.setattr(provider, "accept_output", lambda data: data)
    return provider


def test_missing_bfl_key_never_creates_provider() -> None:
    with pytest.raises(ValueError, match="BFL_API_KEY"):
        BflStudioProvider("openai-test-not-a-secret", "")


def test_untrusted_base_url_rejected() -> None:
    with pytest.raises(ValueError, match=r"bfl\.ai"):
        BflStudioProvider("o", KEY, base_url="https://evil.example/v1")


def test_artwork_and_edits_never_reach_flux(monkeypatch: pytest.MonkeyPatch) -> None:
    """ADR-0009: FLUX.2 draws skin, not artwork. The inherited OpenAI path owns the master.

    Measured live twice: asked for flat artwork on white, FLUX.2 returns a photograph of the
    tattoo already applied to a limb, and holds that against explicit instruction. The
    pipeline reads any non-white pixel as ink, so such a master corrupts the crop, the zone
    sizing and the stencil trace.
    """
    script = Script([])
    provider = make(monkeypatch, script)
    calls: list[str] = []

    def spy(*args: object, **kwargs: object) -> bytes:
        calls.append("flux")
        return b""

    monkeypatch.setattr(provider, "flux", spy)

    assert type(provider)._artwork is StudioProvider._artwork
    assert type(provider).edit_artwork is StudioProvider.edit_artwork
    assert calls == []
    provider.close()


def test_openai_image_model_is_not_overwritten_by_the_flux_model() -> None:
    """The inherited artwork path posts ``image_model`` to api.openai.com."""
    provider = BflStudioProvider("openai-test-not-a-secret", KEY)
    assert provider.image_model == "gpt-image-2"
    assert provider.background_model == "flux-2-pro"
    provider.close()


def test_background_is_text_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """ADR-0007: no photograph is ever an input to the image generator."""
    script = Script([ready()])
    provider = make(monkeypatch, script)
    provider.background(BRIEF)
    payload = script.posts[0][1]["json"]
    assert not any(key.startswith("input_image") for key in payload)
    assert "unmarked adult" in payload["prompt"]
    provider.close()


def test_credential_never_sent_to_delivery_host(monkeypatch: pytest.MonkeyPatch) -> None:
    script = Script([ready()])
    provider = make(monkeypatch, script)
    provider.background(BRIEF)
    url, kwargs = script.downloads[0]
    assert url == SAMPLE
    assert KEY not in repr(kwargs)
    provider.close()


@pytest.mark.parametrize("status", ["Request Moderated", "Content Moderated"])
def test_moderation_is_terminal(monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    script = Script([{"status": status}])
    provider = make(monkeypatch, script)
    with pytest.raises(ValueError, match="rechazó"):
        provider.background(BRIEF)
    assert len(script.posts) == 1
    provider.close()


@pytest.mark.parametrize(
    ("status", "message"),
    [(402, "créditos"), (401, "BFL_API_KEY"), (429, "frecuencia"), (500, "500")],
)
def test_http_errors_are_explicit_and_do_not_leak_key(
    monkeypatch: pytest.MonkeyPatch, status: int, message: str
) -> None:
    script = Script([], submit=Response(status, {"detail": KEY}))
    provider = make(monkeypatch, script)
    with pytest.raises(ValueError, match=message) as error:
        provider.background(BRIEF)
    assert KEY not in str(error.value)
    provider.close()


@pytest.mark.parametrize(
    "bad",
    [
        "http://api.eu.bfl.ai/v1/get_result",
        "https://api.eu.bfl.ai.evil.test/x",
        "https://127.0.0.1/x",
        None,
    ],
)
def test_untrusted_polling_url_is_not_followed(
    monkeypatch: pytest.MonkeyPatch, bad: object
) -> None:
    script = Script([], submit=Response(200, {"id": "abc", "polling_url": bad}))
    provider = make(monkeypatch, script)
    with pytest.raises(ValueError, match="inválida"):
        provider.background(BRIEF)
    assert script.gets == []
    provider.close()


def test_untrusted_sample_url_is_not_downloaded(monkeypatch: pytest.MonkeyPatch) -> None:
    script = Script([ready("https://attacker.test/x.png")])
    provider = make(monkeypatch, script)
    with pytest.raises(ValueError, match="inválida"):
        provider.background(BRIEF)
    assert script.downloads == []
    provider.close()


def test_poll_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    ticks = iter([0.0, 1.0, 5.0])
    script = Script([{"status": "Pending"}, {"status": "Pending"}])
    provider = make(monkeypatch, script, max_wait_s=2.0, clock=lambda: next(ticks))
    with pytest.raises(ValueError, match="tiempo"):
        provider.background(BRIEF)
    provider.close()


def test_too_many_input_images_rejected_before_any_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    script = Script([])
    provider = make(monkeypatch, script)
    with pytest.raises(ValueError, match="máximo"):
        provider.flux("flux-2-pro", "p", [b"r"] * (MAX_INPUT_IMAGES + 1), (1024, 1536))
    assert script.posts == []
    provider.close()


def test_output_moderation_still_applies(monkeypatch: pytest.MonkeyPatch) -> None:
    script = Script([ready()])
    provider = make(monkeypatch, script)
    seen: list[bytes] = []

    def record(data: bytes) -> bytes:
        seen.append(data)
        return data

    monkeypatch.setattr(provider, "accept_output", record)
    provider.background(BRIEF)
    assert seen == [b"png-bytes"]
    provider.close()
