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


def test_generation_provider_defaults_to_the_offline_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A misconfigured deployment should produce obvious fakes, not spend real money."""
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")

    assert load_settings().generation_provider == "fixture"


def test_fal_key_is_read_from_the_plain_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    """fal's own tooling uses FAL_KEY; a second prefixed copy would invite drift."""
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")
    monkeypatch.setenv("FAL_KEY", "fal-secret-value")

    settings = load_settings()

    assert settings.fal_key is not None
    assert settings.fal_key.get_secret_value() == "fal-secret-value"


def test_fal_key_is_absent_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")

    assert load_settings().fal_key is None


def test_fal_key_does_not_appear_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    """SEC-INV-008: a credential must not leak through a traceback or a log line."""
    secret = "fal-must-not-be-printed-4f2a"
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")
    monkeypatch.setenv("FAL_KEY", secret)

    settings = load_settings()

    assert secret not in repr(settings)
    assert secret not in str(settings)
    assert secret not in repr(settings.fal_key)


# TASK-0025: image backend selection -------------------------------------------------


def _backend_settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    monkeypatch.delenv("BFL_API_KEY", raising=False)
    monkeypatch.setenv("TATTOO_ENVIRONMENT", "local")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-not-a-secret")
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return load_settings()


def test_default_backend_is_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.studio import build_provider
    from generation.bfl_studio import BflStudioProvider

    provider = build_provider(_backend_settings(monkeypatch))
    assert not isinstance(provider, BflStudioProvider)
    provider.close()


def test_bfl_backend_selected_by_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.studio import build_provider
    from generation.bfl_studio import BflStudioProvider

    settings = _backend_settings(
        monkeypatch, TATTOO_IMAGE_BACKEND="bfl", BFL_API_KEY="bfl-test-not-a-secret"
    )
    provider = build_provider(settings)
    assert isinstance(provider, BflStudioProvider)
    assert provider.base_url == "https://api.eu.bfl.ai"
    assert provider.background_model == "flux-2-pro"
    # ADR-0009: artwork stays on OpenAI, so the inherited image model must remain OpenAI's.
    assert provider.image_model == settings.image_model == "gpt-image-2"
    assert "bfl-test-not-a-secret" not in repr(settings)
    provider.close()


def test_bfl_backend_without_key_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.studio import build_provider

    with pytest.raises(SettingsError, match="BFL_API_KEY"):
        build_provider(_backend_settings(monkeypatch, TATTOO_IMAGE_BACKEND="bfl"))
