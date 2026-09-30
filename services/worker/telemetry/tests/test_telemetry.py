"""TASK-0054. The store runs its real SQL on SQLite; production runs the same SQL on Postgres."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

import telemetry.store as store_module
from telemetry import Event, activity, configure, forget, record
from telemetry.meter import provider_call
from telemetry.store import EventStore, postgres_store, sqlite_store
from telemetry.usage import Prices, configure_prices, tokens

ACCOUNT = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def events(tmp_path: Path) -> Iterator[EventStore]:
    store = sqlite_store(tmp_path / "telemetry.sqlite", start=False)
    configure(store)
    yield store
    configure(EventStore(lambda: None, style="sqlite", start=False))
    configure_prices(Prices())


def since() -> datetime:
    return datetime.now(UTC) - timedelta(hours=1)


def test_events_are_kept_and_read_back(events: EventStore) -> None:
    record("job", "generate", account=ACCOUNT, duration_ms=1200, detail={"zone": "calf"})
    record("upload", "reference", account=ACCOUNT)

    found = events.events(since())

    assert [(e["kind"], e["operation"]) for e in found] == [
        ("upload", "reference"),
        ("job", "generate"),
    ]
    assert found[1]["duration_ms"] == 1200
    assert found[1]["detail"] == {"zone": "calf"}
    assert found[1]["account"] == ACCOUNT
    assert isinstance(found[1]["ts"], datetime)


def test_an_activity_attributes_what_happens_inside_it(events: EventStore) -> None:
    with activity(ACCOUNT, "job-1"):
        record("provider_call", "artwork")
    record("provider_call", "artwork")

    newest, oldest = events.events(since())
    assert (oldest["account"], oldest["job"]) == (ACCOUNT, "job-1")
    assert (newest["account"], newest["job"]) == (None, None)


def test_erasing_an_account_keeps_its_numbers_and_drops_who_and_what(events: EventStore) -> None:
    record("consultation_turn", "message", account=ACCOUNT, text="Un lobo en el gemelo")
    record("provider_call", "artwork", account=ACCOUNT, input_tokens=900, output_tokens=4000)

    forget(ACCOUNT)

    rows = events.events(since())
    assert all(row["account"] is None and row["text"] is None for row in rows)
    assert sorted(row["input_tokens"] or 0 for row in rows) == [0, 900]


def test_old_events_are_purged(events: EventStore) -> None:
    events.put(Event("job", "generate", ts=datetime.now(UTC) - timedelta(days=400)))
    record("job", "generate")

    events.purge(datetime.now(UTC) - timedelta(days=365))

    assert len(events.events(datetime.now(UTC) - timedelta(days=500))) == 1


def test_a_broken_store_never_breaks_the_studio(tmp_path: Path) -> None:
    def unreachable() -> Any:
        raise sqlite3.OperationalError("down")

    broken = EventStore(unreachable, style="sqlite", start=False)
    configure(broken)
    record("job", "generate")  # no exception
    assert broken.flush() == 0
    assert broken.dropped == 1


def test_the_buffer_is_bounded(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(store_module, "BUFFER", 3)
    small = sqlite_store(tmp_path / "t.sqlite", start=False)
    for _ in range(5):
        small.put(Event("job", "generate"))
    assert small.dropped == 2
    assert small.flush() == 3


def test_text_is_bounded(events: EventStore) -> None:
    record("consultation_turn", "message", text="x" * 10_000)
    assert len(events.events(since())[0]["text"]) == 4000


class Response:
    def __init__(self, status: int, body: dict[str, Any]) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> dict[str, Any]:
        return self._body


def test_a_provider_call_records_tokens_images_duration_and_cost(events: EventStore) -> None:
    configure_prices(
        Prices.parse(
            '{"gpt-image-2": {"input_per_million": 10, "output_per_million": 40, "per_image": 0}}'
        )
    )
    with provider_call("openai", "artwork", "gpt-image-2") as call:
        call.read(
            Response(200, {"usage": {"input_tokens": 1000, "output_tokens": 5000}, "data": [{}]})
        )

    (event,) = events.events(since())
    assert event["outcome"] == "ok"
    assert (event["input_tokens"], event["output_tokens"], event["images"]) == (1000, 5000, 1)
    assert event["cost_usd"] == pytest.approx(0.21)
    assert event["duration_ms"] is not None


def test_a_failed_call_is_recorded_as_one_and_still_raises(events: EventStore) -> None:
    with (
        pytest.raises(ValueError, match="sin créditos"),
        provider_call("bfl", "background", "flux-2-pro"),
    ):
        raise ValueError("sin créditos")
    with provider_call("openai", "edit", "gpt-image-2") as call:
        call.read(Response(429, {}))

    newest, oldest = events.events(since())
    assert (oldest["outcome"], oldest["detail"]["error"]) == ("error", "sin créditos")
    assert (newest["outcome"], newest["detail"]["error"]) == ("error", "HTTP 429")


def test_a_refusal_keeps_the_provider_code_and_never_its_message(events: EventStore) -> None:
    """TASK-0059: the panel said only "HTTP 400"; the cause was OpenAI's safety system."""
    blocked = {"error": {"code": "moderation_blocked", "message": "Your request was rejected ..."}}
    with provider_call("openai", "background", "gpt-image-2") as call:
        call.read(Response(400, blocked))
    with provider_call("openai", "background", "gpt-image-2") as call:
        call.read(Response(400, {"error": {"code": "Not A Code <script>", "message": "x"}}))

    newest, oldest = events.events(since())
    assert oldest["detail"]["error"] == "HTTP 400 moderation_blocked"
    assert newest["detail"]["error"] == "HTTP 400"
    assert "rejected" not in str(oldest["detail"])


def test_a_transport_error_is_reported_by_type_only(events: EventStore) -> None:
    with pytest.raises(ConnectionError), provider_call("openai", "analyze", "m"):
        raise ConnectionError("https://api.example/?key=secret")
    assert events.events(since())[0]["detail"]["error"] == "ConnectionError"


def test_no_price_means_no_cost_not_a_guess(events: EventStore) -> None:
    with provider_call("openai", "artwork", "unpriced-model") as call:
        call.read(Response(200, {"usage": {"input_tokens": 10, "output_tokens": 10}}))
    assert events.events(since())[0]["cost_usd"] is None


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"usage": {"input_tokens": 3, "output_tokens": 4}}, (3, 4)),  # Responses, Images
        ({"usage": {"prompt_tokens": 5, "completion_tokens": 6}}, (5, 6)),  # Chat Completions
        ({"usage": {"input_tokens": 7, "output_tokens": 8}, "type": "message"}, (7, 8)),  # Claude
        ({"results": []}, (None, None)),  # Moderation reports none
        ("not json", (None, None)),
    ],
)
def test_tokens_are_read_from_every_provider_shape(
    body: Any, expected: tuple[int | None, int | None]
) -> None:
    assert tokens(body) == expected


def test_prices_are_validated() -> None:
    with pytest.raises(ValueError):
        Prices.parse("{not json")
    with pytest.raises(ValueError):
        Prices.parse('{"m": {"per_token": 1}}')
    assert Prices.parse(None).cost("m", 1, 1) is None


def test_a_postgres_failure_names_no_secret() -> None:
    """PLAT-INV-005 and SEC-INV-008: a bad connection stops startup without quoting the password."""
    with pytest.raises(RuntimeError) as failure:
        postgres_store("postgresql://inkcraft:hunter2-secret@127.0.0.1:1/postgres")
    assert "hunter2-secret" not in str(failure.value)
    assert failure.value.__cause__ is None
