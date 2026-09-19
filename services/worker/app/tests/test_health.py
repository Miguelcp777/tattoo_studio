"""Tests for the worker application shell."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


def _settings() -> Settings:
    return Settings(environment="test", log_level="INFO")


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
