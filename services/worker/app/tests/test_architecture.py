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

#: Modules permitted to reach the network, by ARCH-INV-001 as amended in TASK-0013.
#: `generation` owns image-model calls; `safety` owns moderation calls. Routing
#: moderation through `generation` was rejected because it would let that module's
#: failure disable the gate that constrains it.
EGRESS_ALLOWED = {"generation", "safety"}

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


# ---------------------------------------------------------------------------
# Module dependency graph (FINDING-0003)
# ---------------------------------------------------------------------------

SPEC_ROOT = WORKER_ROOT.parents[1] / ".specanchor" / "modules"

#: Modules that live in this worker. Others (web, consultation) are TypeScript.
WORKER_MODULES = {"generation", "flash", "media", "safety", "app", "jobs", "stencil", "mockup"}


def _declared_dependencies() -> dict[str, set[str]]:
    """Parse each module spec's Dependencies section.

    Reads the specification rather than the code deliberately: the point is to catch a
    contradiction between what the specs claim and what is buildable, which is exactly
    how the media/safety cycle survived the bootstrap and four tasks.
    """
    import re

    graph: dict[str, set[str]] = {}
    for spec in sorted(SPEC_ROOT.glob("*.spec.md")):
        name = spec.stem.removesuffix(".spec")
        text = spec.read_text(encoding="utf-8")
        match = re.search(r"^## Dependencies\s*\n(.*?)(?=^## )", text, re.MULTILINE | re.DOTALL)
        if not match:
            continue
        # Only the first paragraph lists dependencies. Prose after it may mention other
        # modules legitimately - safety's spec explains why it is *not* coupled to media -
        # and scanning the whole section would read those mentions as edges.
        first_paragraph: list[str] = []
        for line in match.group(1).strip().splitlines():
            if not line.strip():
                break
            first_paragraph.append(line)
        body = " ".join(first_paragraph)
        deps = {m.group(1) for m in re.finditer(r"`([a-z][a-z_-]*)`", body)}
        graph[name] = {d for d in deps if d != name}
    return graph


def test_dependency_graph_was_actually_parsed() -> None:
    """Guards the guard: an empty parse would make the cycle check vacuous."""
    graph = _declared_dependencies()

    assert "media" in graph and "safety" in graph and "generation" in graph
    assert any(deps for deps in graph.values()), "no dependencies parsed at all"


def test_declared_module_graph_is_acyclic() -> None:
    """A cycle means some module can never be built first (FINDING-0003)."""
    graph = _declared_dependencies()
    known = set(graph)

    visiting: set[str] = set()
    done: set[str] = set()
    cycles: list[str] = []

    def visit(node: str, trail: list[str]) -> None:
        if node in done:
            return
        if node in visiting:
            cycles.append(" -> ".join([*trail, node]))
            return
        visiting.add(node)
        for dep in sorted(graph.get(node, set()) & known):
            visit(dep, [*trail, node])
        visiting.discard(node)
        done.add(node)

    for module in sorted(graph):
        visit(module, [])

    assert not cycles, f"circular module dependencies declared: {cycles}"


def test_safety_does_not_depend_on_media() -> None:
    """The gate screens bytes before anything is stored (SEC-INV-007).

    If it depended on media it would be screening something already persisted, which
    contradicts the invariant it exists to serve.
    """
    assert "media" not in _declared_dependencies().get("safety", set())


def test_worker_imports_respect_declared_dependencies() -> None:
    """A module importing something its spec does not declare is undocumented coupling."""
    graph = _declared_dependencies()
    offenders: list[str] = []

    for top, path in _module_files():
        if top not in WORKER_MODULES or top == "app":
            continue
        declared = graph.get(top, set())
        for imported in _imported_roots(path) & (WORKER_MODULES - {"app"}):
            if imported == top:
                continue
            if imported not in declared:
                offenders.append(
                    f"{path.relative_to(WORKER_ROOT)} imports '{imported}', "
                    f"not declared in {top}.spec.md"
                )

    assert not offenders, offenders
