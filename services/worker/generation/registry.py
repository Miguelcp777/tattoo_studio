"""Provider resolution.

The provider is chosen by configuration, never by the caller (GEN public interface).
An engine asks for "a provider" and gets whichever one the deployment is configured
for, so swapping fal for another vendor is a settings change rather than a code change
— which is the entire point of ADR-0001.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping

from .errors import UnknownProviderError
from .fal_provider import FalProvider
from .fixture_provider import FixtureProvider
from .provider import GenerationProvider

ProviderFactory = Callable[[], GenerationProvider]

FIXTURE = "fixture"
FAL = "fal"

KNOWN_PROVIDERS: tuple[str, ...] = (FIXTURE, FAL)


def resolve_provider(name: str, factories: Mapping[str, ProviderFactory]) -> GenerationProvider:
    """Return the configured provider, or fail with a typed error naming the setting.

    Factories are passed in rather than constructed here: a provider needs a media
    store, credentials and a transport, and this module has no business knowing how a
    deployment assembles those.
    """
    try:
        factory = factories[name]
    except KeyError as error:
        known = ", ".join(sorted(factories)) or "<none registered>"
        raise UnknownProviderError(
            f"unknown provider {name!r} (setting TATTOO_GENERATION_PROVIDER); known: {known}",
            provider=name,
        ) from error
    return factory()


__all__ = [
    "FAL",
    "FIXTURE",
    "KNOWN_PROVIDERS",
    "FalProvider",
    "FixtureProvider",
    "ProviderFactory",
    "resolve_provider",
]
