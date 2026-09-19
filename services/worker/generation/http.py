"""The production HTTP transport.

Deliberately the only place in the worker that constructs a network client. The
adapters take a transport as a parameter so their logic is testable offline; this
module is what a real deployment passes in.

Keeping the concrete client here rather than inside an adapter means the architectural
test can assert that outbound capability lives in exactly one module (ARCH-INV-001),
and that the assertion is not vacuous.
"""

from __future__ import annotations

from typing import Any

import httpx2

DEFAULT_TIMEOUT_SECONDS = 120.0


class HttpxTransport:
    """Thin wrapper satisfying :class:`~generation.fal_provider.HttpTransport`.

    Translates the client's own exception hierarchy into the standard-library types the
    adapters map onto typed errors, so no adapter has to know which client is in use.
    """

    def __init__(self, *, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        self._client = httpx2.Client(
            timeout=httpx2.Timeout(timeout_seconds),
            follow_redirects=True,
        )

    def post(self, url: str, *, json: dict[str, Any], headers: dict[str, str]) -> Any:
        return self._send(lambda: self._client.post(url, json=json, headers=headers))

    def get(self, url: str, *, headers: dict[str, str]) -> Any:
        return self._send(lambda: self._client.get(url, headers=headers))

    def _send(self, call: Any) -> Any:
        try:
            return call()
        except httpx2.TimeoutException as error:
            # Adapters map TimeoutError onto their own timeout type. The original
            # message is dropped: a client error can embed the full request URL,
            # which may carry a credential (SEC-INV-008).
            raise TimeoutError("request timed out") from error
        except httpx2.HTTPError as error:
            raise OSError("transport failure") from error

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpxTransport:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
