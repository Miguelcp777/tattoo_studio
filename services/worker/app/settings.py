"""Typed worker settings.

PLAT-INV-005: settings are validated at process start. A missing or malformed required
setting fails startup loudly rather than defaulting.

SEC-INV-008 / PLAT-INV-003: a validation failure names the offending key and never prints
its value. Settings carry credentials, so the error path is as security-relevant as the
values themselves.
"""

from __future__ import annotations

from typing import Literal

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class SettingsError(RuntimeError):
    """Raised when configuration is missing or malformed.

    The message names offending keys only. It never includes their values.
    """


class Settings(BaseSettings):
    """Worker configuration, read from the environment.

    Only settings the shell genuinely needs are declared here. Engine-specific
    configuration is added by the task that introduces the engine, so that an
    unset key always means something is actually missing.
    """

    model_config = SettingsConfigDict(
        env_prefix="TATTOO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str
    """Deployment environment name, for example 'local' or 'production'."""

    log_level: LogLevel = "INFO"
    """Constrained so that a malformed value is a validation failure, which is what
    makes the redaction path in ``_redacted_key_report`` testable."""

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


def _redacted_key_report(error: ValidationError) -> str:
    """Summarise a validation failure by key, discarding every value.

    pydantic's default rendering includes the offending input, which for settings
    can be a credential. This rebuilds the message from locations and error types
    only.
    """
    problems: list[str] = []
    for item in error.errors():
        location = ".".join(str(part) for part in item["loc"]) or "<root>"
        problems.append(f"{location} ({item['type']})")
    return ", ".join(problems)


def load_settings() -> Settings:
    """Load and validate settings, or raise ``SettingsError``.

    Raises:
        SettingsError: with the offending keys named and all values redacted.
    """
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as error:
        raise SettingsError(
            f"Invalid worker configuration. Check these settings: {_redacted_key_report(error)}. "
            "Values are redacted from this message."
        ) from error
