"""fal.ai adapter.

Written against fal's documented HTTP surface, confirmed 2026-09-19:

  POST https://fal.run/<model-id>
  Authorization: Key <FAL_KEY>
  {"prompt": "...", "image_size": {"width": W, "height": H}, "seed": N}

  -> {"images": [{"url", "width", "height", "content_type"}],
      "seed": N, "prompt": "...", "has_nsfw_concepts": [bool]}

This uses the synchronous endpoint rather than the queue. The queue exists for
long-running work and gives progress and cancellation, which this project does want —
but that belongs to the `jobs` module (TASK-0006), which owns asynchrony for the whole
system. Putting a second queue in here would give us two competing notions of a
pending job. The queue endpoint is the obvious upgrade once `jobs` exists.

The HTTP transport is injected so every branch — retries, error mapping, response
normalization — is tested without a network or a credential.

**Live behaviour is unverified.** No request has ever been sent to fal from this
repository. Request construction and response parsing match the documentation, but
documentation and reality differ often enough that this must not be reported as
working until a real call has been made.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from .errors import (
    ContentPolicyRejectionError,
    InvalidGenerationParametersError,
    MalformedProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitedError,
)
from .ports import MediaStore
from .provider import GenerationProvider
from .types import GeneratedImage, MediaType, TextToImageRequest

FAL_SYNC_BASE = "https://fal.run"

DEFAULT_MODEL = "fal-ai/flux/schnell"

_SUPPORTED_MEDIA_TYPES: dict[str, MediaType] = {
    "image/png": "image/png",
    "image/webp": "image/webp",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
}


class HttpResponse(Protocol):
    """The slice of an HTTP response this adapter reads."""

    @property
    def status_code(self) -> int: ...

    @property
    def content(self) -> bytes: ...

    def json(self) -> Any: ...


class HttpTransport(Protocol):
    """Injected so the adapter is fully testable without a network."""

    def post(self, url: str, *, json: dict[str, Any], headers: dict[str, str]) -> HttpResponse: ...

    def get(self, url: str, *, headers: dict[str, str]) -> HttpResponse: ...


class FalProvider(GenerationProvider):
    """Adapter for fal.ai hosted models."""

    name = "fal"

    def __init__(
        self,
        *,
        api_key: str,
        media_store: MediaStore,
        transport: HttpTransport,
        base_url: str = FAL_SYNC_BASE,
        **kwargs: object,
    ) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        if not api_key:
            raise InvalidGenerationParametersError("fal api key is empty", provider=self.name)
        self._api_key = api_key
        self._media = media_store
        self._http = transport
        self._base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Key {self._api_key}",
            "Content-Type": "application/json",
        }

    def _text_to_image(self, request: TextToImageRequest) -> GeneratedImage:
        payload: dict[str, Any] = {
            "prompt": request.prompt,
            "image_size": {"width": request.width_px, "height": request.height_px},
        }
        if request.seed is not None:
            payload["seed"] = request.seed
        if request.negative_prompt:
            payload["negative_prompt"] = request.negative_prompt
        payload.update(request.extra)

        url = f"{self._base_url}/{request.model}"
        response = self._request(
            lambda: self._http.post(url, json=payload, headers=self._headers())
        )

        body = self._decode(response)
        image_meta = self._first_image(body)
        data = self._download(image_meta["url"])

        media_type = _SUPPORTED_MEDIA_TYPES.get(
            str(image_meta.get("content_type", "image/jpeg")).lower()
        )
        if media_type is None:
            raise MalformedProviderResponseError(
                f"unsupported content type {image_meta.get('content_type')!r}", provider=self.name
            )

        width, height = self._dimensions(image_meta, request)
        stored = self._media.put(
            data,
            media_type=media_type,
            width_px=width,
            height_px=height,
            hint=f"fal/{request.model.replace('/', '-')}",
        )

        return GeneratedImage(
            image=stored,
            provider=self.name,
            model=request.model,
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            seed=body.get("seed") if isinstance(body.get("seed"), int) else request.seed,
        )

    # ------------------------------------------------------------------
    # Response handling
    # ------------------------------------------------------------------

    def _request(self, send: Callable[[], HttpResponse]) -> HttpResponse:
        """Issue a call, mapping transport faults onto typed errors."""
        try:
            response = send()
        except TimeoutError as error:
            raise ProviderTimeoutError("request timed out", provider=self.name) from error
        except OSError as error:
            # Deliberately does not include str(error): a transport error can embed the
            # request URL, which may carry a credential (SEC-INV-008).
            raise ProviderUnavailableError("transport failure", provider=self.name) from error

        self._raise_for_status(response)
        return response

    def _raise_for_status(self, response: HttpResponse) -> None:
        status = response.status_code
        if status < 400:
            return
        if status == 429:
            raise RateLimitedError("rate limited", provider=self.name)
        if status in (400, 422):
            # Body text is not echoed: a 400 can repeat the submitted payload.
            raise InvalidGenerationParametersError(
                f"provider rejected the request ({status})", provider=self.name
            )
        if status in (401, 403):
            raise InvalidGenerationParametersError(
                f"provider rejected credentials ({status})", provider=self.name
            )
        if status == 408 or status == 504:
            raise ProviderTimeoutError(f"provider timed out ({status})", provider=self.name)
        raise ProviderUnavailableError(f"provider error ({status})", provider=self.name)

    def _decode(self, response: HttpResponse) -> dict[str, Any]:
        try:
            body = response.json()
        except Exception as error:
            raise MalformedProviderResponseError(
                "response was not JSON", provider=self.name
            ) from error
        if not isinstance(body, dict):
            raise MalformedProviderResponseError("response was not an object", provider=self.name)

        # fal reports moderation outcomes in-band rather than as an error status.
        flags = body.get("has_nsfw_concepts")
        if isinstance(flags, list) and any(bool(f) for f in flags):
            raise ContentPolicyRejectionError(
                "provider flagged the output as unsafe", provider=self.name
            )
        return body

    def _first_image(self, body: dict[str, Any]) -> dict[str, Any]:
        images = body.get("images")
        if not isinstance(images, list) or not images:
            raise MalformedProviderResponseError("response contained no images", provider=self.name)
        first = images[0]
        if not isinstance(first, dict) or not isinstance(first.get("url"), str) or not first["url"]:
            raise MalformedProviderResponseError("image entry has no url", provider=self.name)
        return first

    def _dimensions(
        self, image_meta: dict[str, Any], request: TextToImageRequest
    ) -> tuple[int, int]:
        """Prefer the provider's reported size, falling back to what was asked for."""
        width = image_meta.get("width")
        height = image_meta.get("height")
        if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
            return width, height
        return request.width_px, request.height_px

    def _download(self, url: str) -> bytes:
        response = self._request(lambda: self._http.get(url, headers={}))
        data = response.content
        if not data:
            raise MalformedProviderResponseError("image body was empty", provider=self.name)
        return data
