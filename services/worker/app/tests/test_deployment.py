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


def test_only_the_proxy_publishes_ports() -> None:
    """The worker holds the media store and the generation credentials; nothing outside the
    compose network may reach it (ADR-0020)."""
    blocks = service_blocks((INFRA / "docker-compose.yml").read_text(encoding="utf-8"))
    assert set(blocks) == {"worker", "web", "caddy"}
    published = {name for name, block in blocks.items() if re.search(r"^\s+ports:", block, re.M)}
    assert published == {"caddy"}


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


def test_the_certificate_uses_a_dns_challenge() -> None:
    """DNS-01 is what lets the host keep every inbound port closed and still hold a real
    certificate, which the camera requires (TASK-0042)."""
    caddyfile = (INFRA / "Caddyfile").read_text(encoding="utf-8")
    assert re.search(r"tls\s*\{[^}]*dns ", caddyfile, re.S)
    assert "xcaddy build --with" in (INFRA / "Dockerfile.caddy").read_text(encoding="utf-8")


def test_the_runbook_states_the_exposure_before_the_steps() -> None:
    """There is no authentication yet: anyone who reaches the URL spends the owner's credits. The
    warning is worth nothing below the instructions."""
    readme = (INFRA / "README.md").read_text(encoding="utf-8")
    warning = readme.index("There is no authentication yet")
    assert warning < readme.index("## 1. The VM")
