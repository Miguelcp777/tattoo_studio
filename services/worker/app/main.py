"""Worker application shell.

Contains no domain logic. Engines are added by their own tasks; this module exists so
the build, the test suite and the deployment target have something to run.
"""

from __future__ import annotations

import sys
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.settings import Settings, SettingsError, load_settings


class HealthResponse(BaseModel):
    """Liveness payload. Deliberately free of configuration detail."""

    status: Literal["ok"]
    environment: str


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application.

    Settings are resolved at construction time so that a misconfigured process
    fails at startup rather than on the first request (PLAT-INV-005).
    """
    resolved = settings if settings is not None else load_settings()

    app = FastAPI(
        title="Tattoo Creator Worker",
        version="0.0.0",
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", environment=resolved.environment)

    return app


def main() -> int:
    """Entrypoint that reports configuration failure without leaking values."""
    try:
        load_settings()
    except SettingsError as error:
        print(f"startup failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
