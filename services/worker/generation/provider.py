"""The generation provider surface.

This is the system's only outbound path to an image model (ARCH-INV-001, GEN-INV-001).

The invariants live in the base class rather than in each adapter, so an adapter cannot
forget them: an adapter implements ``_text_to_image`` and friends, and inherits the
clearance check, the retry policy and the result normalization. Adding a provider means
writing request construction and response parsing, nothing else.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

from .errors import (
    GenerationError,
    InvalidGenerationParametersError,
    MalformedProviderResponseError,
    SafetyGateUnavailableError,
)
from .retry import RetryPolicy, Sleep, call_with_retry
from .types import (
    GeneratedImage,
    ImageConditionedRequest,
    SafetyClearance,
    TextToImageRequest,
)

MAX_PROMPT_CHARS = 4000
MAX_DIMENSION_PX = 16384


def _default_sleep(seconds: float) -> None:  # pragma: no cover - trivial
    import time

    time.sleep(seconds)


class GenerationProvider(ABC):
    """Base adapter. Subclasses implement the provider-specific halves only."""

    #: Stable adapter name, recorded in Design provenance. Never a credential or endpoint.
    name: str = "unnamed"

    def __init__(
        self,
        *,
        retry_policy: RetryPolicy | None = None,
        sleep: Sleep | None = None,
    ) -> None:
        self._retry = retry_policy or RetryPolicy()
        self._sleep: Sleep = sleep or _default_sleep

    # ------------------------------------------------------------------
    # Public surface. Final by convention: overriding these would bypass the
    # invariants they enforce.
    # ------------------------------------------------------------------

    def text_to_image(self, request: TextToImageRequest) -> GeneratedImage:
        """Generate from a prompt alone. The only shape the flash path uses."""
        self._validate_text_request(request)
        return self._run(lambda: self._text_to_image(request))

    def image_to_image(
        self, request: ImageConditionedRequest, clearance: SafetyClearance
    ) -> GeneratedImage:
        """Generate conditioned on an existing image.

        Requires a clearance that cannot currently be constructed, so this path is
        unreachable until the safety module exists (SEC-INV-007, GEN-INV-003).
        """
        self._require_clearance(clearance)
        return self._run(lambda: self._image_to_image(request, clearance))

    def inpaint(
        self, request: ImageConditionedRequest, clearance: SafetyClearance
    ) -> GeneratedImage:
        """Generate into a masked region of an existing image. Same gate as above."""
        self._require_clearance(clearance)
        if request.mask is None:
            raise InvalidGenerationParametersError("inpaint requires a mask", provider=self.name)
        return self._run(lambda: self._inpaint(request, clearance))

    # ------------------------------------------------------------------
    # Invariant enforcement
    # ------------------------------------------------------------------

    def _require_clearance(self, clearance: object) -> None:
        """Deny unless a genuine clearance is presented.

        Deliberately checks the concrete type rather than a duck-typed attribute. The
        gate denies when absent; it never falls open (SAFETY-INV-007).
        """
        if not isinstance(clearance, SafetyClearance):
            raise SafetyGateUnavailableError(
                "image-conditioned generation requires a safety clearance; refusing",
                provider=self.name,
            )

    def _validate_text_request(self, request: TextToImageRequest) -> None:
        if not request.prompt.strip():
            raise InvalidGenerationParametersError("prompt is empty", provider=self.name)
        if len(request.prompt) > MAX_PROMPT_CHARS:
            raise InvalidGenerationParametersError(
                f"prompt exceeds {MAX_PROMPT_CHARS} characters", provider=self.name
            )
        for label, value in (("width_px", request.width_px), ("height_px", request.height_px)):
            if value < 1 or value > MAX_DIMENSION_PX:
                raise InvalidGenerationParametersError(
                    f"{label} out of range: must be 1..{MAX_DIMENSION_PX}", provider=self.name
                )
        if not request.model.strip():
            raise InvalidGenerationParametersError("model is empty", provider=self.name)

    def _run(self, operation: Callable[[], GeneratedImage]) -> GeneratedImage:
        result = call_with_retry(operation, policy=self._retry, sleep=self._sleep)
        self._validate_result(result)
        return result

    def _validate_result(self, result: GeneratedImage) -> None:
        """Normalize-and-check before anything leaves the module (GEN-INV-004)."""
        if not isinstance(result, GeneratedImage):  # pragma: no cover - defensive
            raise MalformedProviderResponseError(
                "adapter returned a non-result", provider=self.name
            )
        image = result.image
        if not image.storage_key:
            raise MalformedProviderResponseError("result has no storage key", provider=self.name)
        if image.width_px < 1 or image.height_px < 1:
            raise MalformedProviderResponseError(
                "result has non-positive dimensions", provider=self.name
            )
        if "://" in image.storage_key:
            # A URL here would mean the adapter leaked a provider location into a
            # domain object, which SEC-INV-008 forbids.
            raise MalformedProviderResponseError(
                "storage key looks like a URL, not an opaque key", provider=self.name
            )

    # ------------------------------------------------------------------
    # Adapter responsibilities
    # ------------------------------------------------------------------

    @abstractmethod
    def _text_to_image(self, request: TextToImageRequest) -> GeneratedImage:
        """Provider-specific request construction and response normalization."""

    def _image_to_image(
        self, request: ImageConditionedRequest, clearance: SafetyClearance
    ) -> GeneratedImage:
        raise NotImplementedError(f"{self.name} does not implement image_to_image yet")

    def _inpaint(
        self, request: ImageConditionedRequest, clearance: SafetyClearance
    ) -> GeneratedImage:
        raise NotImplementedError(f"{self.name} does not implement inpaint yet")


__all__ = [
    "MAX_DIMENSION_PX",
    "MAX_PROMPT_CHARS",
    "GenerationError",
    "GenerationProvider",
]
