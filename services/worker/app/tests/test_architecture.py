"""Architectural invariants, enforced by inspection rather than by convention.

A rule written only in a specification is a rule that drifts. These tests read the
worker's own source and fail when a boundary is crossed, so the invariant survives a
refactor by someone who never read the spec.

Deliberately placed in the worker application package rather than in any one module:
an invariant about which modules may do what cannot be owned by one of those modules.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

WORKER_ROOT = Path(__file__).resolve().parents[2]

#: Modules permitted to reach the network. Exactly one, by ARCH-INV-001.
EGRESS_ALLOWED = {"generation"}

#: HTTP clients and provider SDKs. Importing any of these is outbound capability.
NETWORK_MODULES = {
    "httpx",
    "httpx2",
    "requests",
    "urllib",
    "urllib3",
    "http",
    "aiohttp",
    "socket",
    "fal_client",
    "openai",
    "replicate",
    "anthropic",
}

#: Directories that are worker modules rather than tooling or virtualenvs.
SKIP_DIRS = {".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}


def _module_files() -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    for path in sorted(WORKER_ROOT.rglob("*.py")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        relative = path.relative_to(WORKER_ROOT)
        top = relative.parts[0]
        found.append((top, path))
    return found


def _imported_roots(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            roots.add(node.module.split(".")[0])
    return roots


def test_source_scan_actually_finds_modules() -> None:
    """Guards the guard.

    If the scan silently matched nothing, every test below would pass while checking
    nothing at all.
    """
    modules = {top for top, _ in _module_files()}

    assert "generation" in modules
    assert "flash" in modules
    assert len(_module_files()) >= 10


def test_only_generation_may_reach_the_network() -> None:
    """ARCH-INV-001 / GEN-INV-001, enforced rather than trusted."""
    offenders: list[str] = []

    for top, path in _module_files():
        if top in EGRESS_ALLOWED:
            continue
        leaked = _imported_roots(path) & NETWORK_MODULES
        if leaked:
            offenders.append(f"{path.relative_to(WORKER_ROOT)} imports {sorted(leaked)}")

    assert not offenders, (
        f"only the generation module may perform outbound calls (ARCH-INV-001); found: {offenders}"
    )


def test_flash_cannot_reach_user_photographs() -> None:
    """ARCH-INV-004 and the flash security note.

    `flash` handles artwork only. It must not acquire a dependency that would give it
    access to user photographs, which is why it may not import `media` at all.
    """
    offenders: list[str] = []

    for top, path in _module_files():
        if top != "flash":
            continue
        forbidden = _imported_roots(path) & {"media"}
        if forbidden:
            offenders.append(str(path.relative_to(WORKER_ROOT)))

    assert not offenders, f"flash must not depend on media: {offenders}"


def test_contracts_module_is_not_bypassed() -> None:
    """Payload shapes come from the contracts package, not from local redefinitions.

    A worker module defining its own `TattooBrief` or `Design` class would reintroduce
    exactly the drift ADR-0004 exists to prevent.
    """
    offenders: list[str] = []
    reserved = {"TattooBrief", "Design"}

    for _top, path in _module_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name in reserved:
                offenders.append(f"{path.relative_to(WORKER_ROOT)}:{node.name}")

    assert not offenders, (
        "contract payloads are defined once in contracts/schemas, never re-declared "
        f"in the worker: {offenders}"
    )


@pytest.mark.parametrize("module", sorted(EGRESS_ALLOWED))
def test_the_allowlist_is_not_vacuous(module: str) -> None:
    """The permitted module must actually use its permission.

    If `generation` stopped importing an HTTP client, the egress test above would pass
    trivially and stop meaning anything.
    """
    imports: set[str] = set()
    for top, path in _module_files():
        if top == module:
            imports |= _imported_roots(path)

    assert imports & NETWORK_MODULES, (
        f"{module} is allowlisted for egress but imports no network client; "
        "either the allowlist or the scan is stale"
    )
