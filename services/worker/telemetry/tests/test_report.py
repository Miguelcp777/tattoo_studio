"""TASK-0055: what the administrator sees, computed from events."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from telemetry.report import activity, overview

ANA = "11111111-1111-4111-8111-111111111111"
LUIS = "22222222-2222-4222-8222-222222222222"
ADMIN = "33333333-3333-4333-8333-333333333333"
NOW = datetime(2026, 9, 30, 12, tzinfo=UTC)


def row(minutes_ago: int, kind: str, operation: str, **fields: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "ts": NOW - timedelta(minutes=minutes_ago),
        "kind": kind,
        "operation": operation,
        "outcome": "ok",
        "account": None,
        "job": None,
        "provider": None,
        "model": None,
        "duration_ms": None,
        "input_tokens": None,
        "output_tokens": None,
        "images": None,
        "cost_usd": None,
        "text": None,
        "detail": {},
    }
    return {**base, **fields}


# Newest first, as the store returns them.
ROWS = [
    row(1, "admin", "overview", account=ADMIN),
    row(2, "job", "generate", account=ANA, duration_ms=90_000),
    row(
        3,
        "provider_call",
        "artwork",
        account=ANA,
        provider="openai",
        model="gpt-image-2",
        input_tokens=500,
        output_tokens=4000,
        images=1,
        cost_usd=0.2,
        duration_ms=60_000,
    ),
    row(
        4,
        "provider_call",
        "background",
        account=ANA,
        provider="bfl",
        model="flux-2-pro",
        images=1,
        duration_ms=20_000,
        outcome="error",
        detail={"error": "FLUX ha superado"},
    ),
    row(5, "consultation_turn", "message", account=ANA, text="Un lobo"),
    row(6, "sign_in", "password", account=ANA, text="ana@example.com"),
    row(7, "sign_in", "password", outcome="refused"),
    row(
        60 * 25,
        "job",
        "generate",
        account=LUIS,
        duration_ms=30_000,
        outcome="error",
        detail={"error": "Proveedor no disponible"},
    ),
    row(
        60 * 25 + 1,
        "provider_call",
        "artwork",
        account=LUIS,
        provider="openai",
        model="gpt-image-2",
        input_tokens=100,
        output_tokens=900,
        images=1,
        duration_ms=10_000,
    ),
]


def test_the_totals_say_what_happened() -> None:
    totals = overview(ROWS)["totals"]
    assert (totals["generations"], totals["succeeded"], totals["failed"]) == (2, 1, 1)
    assert totals["successRate"] == 0.5
    assert totals["durationMs"] == {"avg": 90_000, "p50": 90_000, "p95": 90_000}
    assert (totals["calls"], totals["callErrors"]) == (3, 1)
    assert (totals["inputTokens"], totals["outputTokens"], totals["images"]) == (600, 4900, 3)
    # Only the priced call counts towards cost; the others are counted as unpriced, not as zero.
    assert (totals["costUsd"], totals["unpricedCalls"]) == (0.2, 2)
    assert totals["accounts"] == 3  # Ana, Luis, and the administrator who looked
    assert (totals["signIns"], totals["signInRefusals"], totals["messages"]) == (1, 1, 1)


def test_models_are_ranked_by_use() -> None:
    first, second = overview(ROWS)["byModel"]
    assert (first["provider"], first["operation"], first["calls"]) == ("openai", "artwork", 2)
    assert (first["inputTokens"], first["outputTokens"]) == (600, 4900)
    assert (second["provider"], second["errors"]) == ("bfl", 1)


def test_days_and_people() -> None:
    report = overview(ROWS)
    assert [day["day"] for day in report["byDay"]] == ["2026-09-29", "2026-09-30"]
    assert report["byDay"][0]["failed"] == 1
    people = {person["account"]: person for person in report["byAccount"]}
    # The administrator's own looking is audit, not use of the studio.
    assert set(people) == {ANA, LUIS}
    assert people[ANA]["email"] == "ana@example.com"
    assert people[LUIS]["email"] is None
    assert (people[ANA]["generations"], people[ANA]["messages"], people[ANA]["tokens"]) == (
        1,
        1,
        4500,
    )
    assert report["byAccount"][0]["account"] == ANA  # most recently seen first


def test_errors_name_their_reason_and_leave_out_sign_in_refusals() -> None:
    errors = overview(ROWS)["errors"]
    assert [error["reason"] for error in errors] == ["FLUX ha superado", "Proveedor no disponible"]


def test_an_account_activity_is_only_that_account() -> None:
    found = activity(ROWS, ANA)
    assert found["email"] == "ana@example.com"
    assert {event["kind"] for event in found["events"]} == {
        "job",
        "provider_call",
        "consultation_turn",
        "sign_in",
    }
    message = next(e for e in found["events"] if e["kind"] == "consultation_turn")
    assert message["text"] == "Un lobo"
    # The address is shown once, not repeated on every sign-in row.
    assert all(e["text"] is None for e in found["events"] if e["kind"] == "sign_in")


def test_nothing_recorded_is_an_empty_report_not_an_error() -> None:
    report = overview([])
    assert report["totals"]["successRate"] is None
    assert report["totals"]["durationMs"] == {"avg": None, "p50": None, "p95": None}
    assert report["byModel"] == report["byDay"] == report["byAccount"] == report["errors"] == []
