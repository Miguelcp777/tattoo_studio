"""The system's only outbound path to an image model (ARCH-INV-001, GEN-INV-001).

No other module may call a hosted model, and a test enforces that rather than trusting
convention. Everything leaves this module as a normalized :class:`GeneratedImage`
carrying an opaque storage key — never raw bytes and never a provider URL.
"""

from .errors import (
    ContentPolicyRejectionError,
    GenerationError,
    InvalidGenerationParametersError,
    MalformedProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitedError,
    SafetyGateUnavailableError,
    UnknownProviderError,
)
from .fal_provider import FalProvider
from .fixture_provider import FixtureProvider
from .ports import MediaStore
from .provider import GenerationProvider
from .registry import KNOWN_PROVIDERS, resolve_provider
from .retry import RetryPolicy
from .types import (
    GeneratedImage,
    ImageConditionedRequest,
    ImageRef,
    MediaType,
    SafetyClearance,
    TextToImageRequest,
)

__all__ = [
    "KNOWN_PROVIDERS",
    "ContentPolicyRejectionError",
    "FalProvider",
    "FixtureProvider",
    "GeneratedImage",
    "GenerationError",
    "GenerationProvider",
    "ImageConditionedRequest",
    "ImageRef",
    "InvalidGenerationParametersError",
    "MalformedProviderResponseError",
    "MediaStore",
    "MediaType",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
    "RateLimitedError",
    "RetryPolicy",
    "SafetyClearance",
    "SafetyGateUnavailableError",
    "TextToImageRequest",
    "UnknownProviderError",
    "resolve_provider",
]
