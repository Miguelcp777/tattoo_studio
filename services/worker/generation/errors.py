"""Typed errors for the generation module.

The distinction that matters operationally is ``transient``: transient failures are
worth retrying with backoff, terminal ones never are. A content-policy rejection in
particular must never be retried — retrying it would amount to arguing with a
moderation decision, and a softened-prompt retry is explicitly forbidden by
`flash.spec.md`.

No error message here may carry image bytes, a credential or a signed URL
(SEC-INV-008). Messages name the provider and the failure class only.
"""

from __future__ import annotations


class GenerationError(Exception):
    """Base for every failure leaving the generation module."""

    transient: bool = False

    def __init__(self, message: str, *, provider: str) -> None:
        super().__init__(f"[{provider}] {message}")
        self.provider = provider


class ProviderUnavailableError(GenerationError):
    """The provider could not be reached, or returned a server-side failure."""

    transient = True


class RateLimitedError(GenerationError):
    """The provider rejected the call for rate reasons."""

    transient = True


class ProviderTimeoutError(GenerationError):
    """The call exceeded its deadline."""

    transient = True


class ContentPolicyRejectionError(GenerationError):
    """The provider refused on content-policy grounds.

    Terminal by design. Surfaced to the user as a rejection, never retried and never
    re-attempted with a softened prompt.
    """

    transient = False


class InvalidGenerationParametersError(GenerationError):
    """The request was malformed before it reached the provider."""

    transient = False


class MalformedProviderResponseError(GenerationError):
    """The provider returned something this adapter cannot normalize (GEN-INV-004).

    Raised rather than returning a partial result, so a half-understood response never
    escapes the module.
    """

    transient = False


class SafetyGateUnavailableError(GenerationError):
    """An image-conditioned call was attempted without a usable safety gate.

    The gate denies when absent; it never falls open (SEC-INV-007, SAFETY-INV-007).
    """

    transient = False


class UnknownProviderError(GenerationError):
    """Configuration names a provider that is not registered."""

    transient = False
