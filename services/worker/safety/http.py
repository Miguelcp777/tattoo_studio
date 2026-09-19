"""HTTP transport for moderation calls.

Deliberately a small duplicate of `generation/http.py` rather than a shared import.

The reasoning is the whole point of TASK-0013/DEC-001: the safety gate's integrity must
not depend on the availability or correctness of the module it exists to constrain. If
`safety` imported its transport from `generation`, a change or a failure there could
affect whether moderation runs at all — which inverts the relationship. Thirty lines of
duplication is a cheaper price than that coupling.

Client exceptions are translated into standard-library types, so the provider maps them
onto its own errors without knowing which client is in use.
"""

from __future__ import annotations

from typing import Any

import httpx2

DEFAULT_TIMEOUT_SECONDS = 60.0


class HttpxTransport:
    """Satisfies `~safety.openai_moderation.HttpTransport`."""

    def __init__(self, *, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        self._client = httpx2.Client(timeout=httpx2.Timeout(timeout_seconds))

    def post(self, url: str, *, json: dict[str, Any], headers: dict[str, str]) -> Any:
        try:
            return self._client.post(url, json=json, headers=headers)
        except httpx2.TimeoutException as error:
            # The original message is dropped: a client error can embed the full request
            # URL and body, which here carries both the image and the credential.
            raise TimeoutError("moderation request timed out") from error
        except httpx2.HTTPError as error:
            raise OSError("moderation transport failure") from error

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpxTransport:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
