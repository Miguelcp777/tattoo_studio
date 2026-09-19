"""Shared fixtures for the flash suite."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

CONTRACTS_FIXTURES = Path(__file__).resolve().parents[4] / "contracts" / "fixtures" / "tattoo-brief"


def load_brief(name: str = "full-colour-traditional") -> dict[str, Any]:
    """Load a brief from the shared contract corpus.

    Reusing the contract fixtures rather than inventing local ones means these tests
    break if the contract changes, which is the point.
    """
    data: dict[str, Any] = json.loads(
        (CONTRACTS_FIXTURES / "valid" / f"{name}.json").read_text(encoding="utf-8")
    )
    return data


class InMemoryDesignStore:
    """A `DesignStore` that keeps designs in a dict."""

    def __init__(self) -> None:
        self.designs: dict[str, dict[str, Any]] = {}

    def save(self, design: dict[str, Any]) -> None:
        self.designs[design["designId"]] = json.loads(json.dumps(design))

    def get(self, design_id: str) -> dict[str, Any] | None:
        return self.designs.get(design_id)


@pytest.fixture
def brief() -> dict[str, Any]:
    return load_brief()


@pytest.fixture
def design_store() -> InMemoryDesignStore:
    return InMemoryDesignStore()
