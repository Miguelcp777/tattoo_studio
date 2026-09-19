"""Test doubles for the generation suite.

The media store double stands in for the port that TASK-0007 will implement. The
transport doubles let every branch of the fal adapter be exercised without a network
or a credential.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from generation.types import ImageRef, MediaType


class InMemoryMediaStore:
    """A `MediaStore` that keeps bytes in a dict.

    Deliberately not a production implementation. The real `media` module owns EXIF
    stripping, encryption at rest and cascade deletion (TASK-0007); none of that is
    simulated here, and this must never be wired into a real deployment.
    """

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put(
        self,
        data: bytes,
        *,
        media_type: MediaType,
        width_px: int,
        height_px: int,
        hint: str,
    ) -> ImageRef:
        key = f"{hint}/{len(self.objects):04d}"
        self.objects[key] = data
        return ImageRef(
            storage_key=key,
            media_type=media_type,
            width_px=width_px,
            height_px=height_px,
            byte_size=len(data),
        )


@dataclass
class FakeResponse:
    status_code: int = 200
    payload: Any = None
    content: bytes = b""

    def json(self) -> Any:
        if self.payload is None:
            raise ValueError("no json body")
        return self.payload


@dataclass
class RecordingTransport:
    """Scripts responses and records every call made.

    Recording is what lets a test assert that *no* request was issued, which is how
    the fail-closed photo path is verified.
    """

    post_responses: list[Any] = field(default_factory=list)
    get_responses: list[Any] = field(default_factory=list)
    calls: list[tuple[str, str]] = field(default_factory=list)

    def _next(self, queue: list[Any], url: str, verb: str) -> FakeResponse:
        self.calls.append((verb, url))
        if not queue:
            raise AssertionError(f"unexpected {verb} to {url}")
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        assert isinstance(item, FakeResponse)
        return item

    def post(self, url: str, *, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
        self.last_post_json = json
        self.last_post_headers = headers
        return self._next(self.post_responses, url, "POST")

    def get(self, url: str, *, headers: dict[str, str]) -> FakeResponse:
        return self._next(self.get_responses, url, "GET")

    @property
    def post_count(self) -> int:
        return sum(1 for verb, _ in self.calls if verb == "POST")


def fal_success(width: int = 512, height: int = 768, seed: int = 4242) -> FakeResponse:
    return FakeResponse(
        status_code=200,
        payload={
            "images": [
                {
                    "url": "https://fal.media/files/example.png",
                    "width": width,
                    "height": height,
                    "content_type": "image/png",
                }
            ],
            "seed": seed,
            "prompt": "whatever was sent",
            "has_nsfw_concepts": [False],
        },
    )


@pytest.fixture
def media_store() -> InMemoryMediaStore:
    return InMemoryMediaStore()


@pytest.fixture
def sleeps() -> list[float]:
    """Collects backoff delays so retry behaviour is asserted without spending time."""
    return []
