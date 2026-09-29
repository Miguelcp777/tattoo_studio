"""The deployment configuration keeps its promises (TASK-0043, ADR-0020).

Text-level on purpose: PyYAML is not a dependency of the worker, and adding one so a test can read
a compose file would be a worse trade than parsing the two things that actually matter. What is
asserted here is what would hurt if it drifted: the worker becoming reachable, the queue being
scaled, and a real credential landing in the committed template.
"""

from __future__ import annotations

import re
from pathlib import Path

INFRA = Path(__file__).resolve().parents[4] / "infra"


def service_blocks(compose: str) -> dict[str, str]:
    """The compose file's services, split on their two-space indented keys."""
    body = compose.split("\nservices:\n", 1)[1]
    # Stop at the next top-level key, or `volumes:` would look like a service.
    following = re.search(r"^\S", body, re.MULTILINE)
    if following:
        body = body[: following.start()]
    names = list(re.finditer(r"^  (\w[\w-]*):$", body, re.MULTILINE))
    blocks: dict[str, str] = {}
    for index, match in enumerate(names):
        end = names[index + 1].start() if index + 1 < len(names) else len(body)
        blocks[match[1]] = body[match.start() : end]
    return blocks


def test_nothing_binds_a_host_port() -> None:
    """Coolify owns 80 and 443 on this host and terminates TLS (TASK-0044). A service binding a
    host port here would collide with it and simply fail to start; the worker must additionally
    never be reachable, since it holds the media store and the generation credentials."""
    blocks = service_blocks((INFRA / "docker-compose.yml").read_text(encoding="utf-8"))
    assert set(blocks) == {"worker", "web"}
    published = {name for name, block in blocks.items() if re.search(r"^\s+ports:", block, re.M)}
    assert published == set()
    # The web app is reachable on the compose network so the proxy can route to it.
    assert re.search(r"^\s+expose:", blocks["web"], re.M)


def test_the_queue_is_never_scaled() -> None:
    """The job queue runs in a thread inside the worker process, so a second replica would be a
    second scheduler over one SQLite file."""
    blocks = service_blocks((INFRA / "docker-compose.yml").read_text(encoding="utf-8"))
    assert re.search(r"replicas:\s*1", blocks["worker"])


def test_the_worker_writes_to_the_mounted_volume() -> None:
    compose = (INFRA / "docker-compose.yml").read_text(encoding="utf-8")
    assert "TATTOO_DATA_DIR: /data/studio" in compose
    assert "worker-data:/data" in compose


def test_the_committed_template_holds_no_credential() -> None:
    """`.env.example` is committed; `.env` is not. Every secret-shaped key must be empty here."""
    secrets = re.compile(r"^(\w*(?:TOKEN|KEY|SECRET|PASSWORD))=(.*)$", re.MULTILINE)
    filled = [
        name
        for name, value in secrets.findall((INFRA / ".env.example").read_text(encoding="utf-8"))
        if value.strip()
    ]
    assert filled == [], f"credential-shaped values in the committed template: {filled}"


def test_the_proxy_layer_is_not_duplicated() -> None:
    """Coolify is the proxy (TASK-0044). Leaving our own Caddy configuration in the tree would
    invite deploying two proxies, or the wrong one."""
    assert not (INFRA / "Caddyfile").exists()
    assert not (INFRA / "Dockerfile.caddy").exists()


def test_the_domain_is_not_declared_in_the_compose_file() -> None:
    """The domain belongs to Coolify's own configuration, not to this file.

    Declaring SERVICE_FQDN_WEB_3000 here with an empty default made every compose read overwrite
    the domain Coolify held, so the UI silently refused to save it and Traefik answered 404 for
    the real hostname. HTTPS is not decoration -- the camera needs a secure context (TASK-0042) --
    so this must not regress."""
    blocks = service_blocks((INFRA / "docker-compose.yml").read_text(encoding="utf-8"))
    for name, block in blocks.items():
        declared = re.search(r"^\s+SERVICE_FQDN_\w+\s*:", block, re.M)
        assert not declared, f"{name}: let Coolify own the domain"


def test_the_runbook_states_the_exposure_before_the_steps() -> None:
    """There is no authentication yet: anyone who reaches the URL spends the owner's credits. The
    warning is worth nothing below the instructions."""
    readme = (INFRA / "README.md").read_text(encoding="utf-8")
    warning = readme.index("There is no authentication yet")
    assert warning < readme.index("## 1. Create the resource")


def test_the_web_image_pins_the_pnpm_that_wrote_the_lockfile() -> None:
    """A different pnpm major refuses the lockfile under --frozen-lockfile. The pin was wrong once
    already (10.11.0 against a lockfile written by 12.4.2), and nothing caught it because the image
    has never been built here."""
    root = INFRA.parent
    lockfile = (root / "pnpm-lock.yaml").read_text(encoding="utf-8")
    assert "lockfileVersion: '9.0'" in lockfile
    dockerfile = (INFRA / "Dockerfile.web").read_text(encoding="utf-8")
    pinned = re.search(r"corepack prepare pnpm@(\d+)\.", dockerfile)
    assert pinned, "the web image must pin an explicit pnpm version"
    # pnpm 9 and 10 also read lockfileVersion 9, but the repository is maintained on 12; pinning
    # below it risks a resolver difference that only appears in the image.
    assert int(pinned[1]) >= 12


def test_the_build_context_is_the_repository_root() -> None:
    """The context is resolved against the compose *project directory*, which the deploy sets to
    the repository root -- not against this file's folder. `context: ..` pointed above the root and
    the first real deploy failed with `lstat /artifacts/infra: no such file or directory`."""
    blocks = service_blocks((INFRA / "docker-compose.yml").read_text(encoding="utf-8"))
    for name, block in blocks.items():
        assert re.search(r"^\s+context: \.$", block, re.M), f"{name}: context must be the root"
        assert re.search(rf"dockerfile: infra/Dockerfile\.{name}$", block, re.M)
    # The images they point at have to exist, or the failure only shows up on the server.
    for name in blocks:
        assert (INFRA / f"Dockerfile.{name}").is_file()
