"""Tests for the worker application shell."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


def _settings() -> Settings:
    # Never read the developer's .env or construct a studio against their live queue.
    return Settings(  # type: ignore[call-arg]  # BaseSettings supports runtime _env_file override.
        environment="test", log_level="INFO", _env_file=None, worker_token=None, media_key=None
    )


def test_health_reports_ok() -> None:
    client = TestClient(create_app(_settings()))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "environment": "test"}


def test_app_construction_does_not_require_ambient_environment() -> None:
    """Injecting settings must bypass environment loading.

    Tests that silently depend on the developer's shell are worse than no tests.
    """
    app = create_app(_settings())

    assert app.title == "Tattoo Creator Worker"
