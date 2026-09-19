"""Tests for startup configuration validation.

Covers TASK-0001/AC-009: a missing required setting fails startup loudly, names the key,
and does not print its value.
"""

from __future__ import annotations

import pytest

from app.main import main
from app.settings import Settings, SettingsError, load_settings


@pytest.fixture(autouse=True)
def _isolate_environment(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Remove ambient configuration and any .env the developer happens to have.

    Without this, a populated local environment would make the failure-path tests
    pass for the wrong reason.
    """
    for key in list(Settings.model_fields):
        monkeypatch.delenv(f"TATTOO_{key.upper()}", raising=False)
    monkeypatch.chdir(tmp_path)


def test_loads_when_required_settings_are_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")

    settings = load_settings()

    assert settings.environment == "local"
    assert settings.log_level == "INFO"
    assert settings.is_production is False


def test_missing_required_setting_raises_and_names_the_key() -> None:
    with pytest.raises(SettingsError) as raised:
        load_settings()

    assert "environment" in str(raised.value)


def test_failure_message_redacts_the_offending_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """A bad value must be named by key only.

    pydantic's default rendering echoes the input. Settings carry credentials, so a
    leaked value in a startup log is a real disclosure (SEC-INV-008).
    """
    secret = "sk-live-must-not-appear-in-logs"
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")
    monkeypatch.setenv("TATTOO_LOG_LEVEL", secret)

    with pytest.raises(SettingsError) as raised:
        load_settings()

    message = str(raised.value)
    assert "log_level" in message
    assert secret not in message


def test_entrypoint_exits_non_zero_when_misconfigured(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = main()

    assert exit_code == 1
    assert "startup failed" in capsys.readouterr().err


def test_entrypoint_exits_zero_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")

    assert main() == 0


def test_production_flag_reflects_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "production")

    assert load_settings().is_production is True
