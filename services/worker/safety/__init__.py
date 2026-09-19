"""Consent, moderation and content-policy gates.

Depends on `contracts` alone. The gate screens *bytes*, before anything is stored and
before anything reaches a provider (SEC-INV-007), so at the moment it runs there is
nothing in `media` for it to look at. That ordering is what keeps the module graph
acyclic (FINDING-0003).
"""

from .clearance import SafetyClearance, content_digest, mint_clearance
from .gate import (
    GATE_VERSION,
    GateResult,
    InputGate,
    ModerationOutcome,
    ModerationProvider,
    ReasonCode,
    Verdict,
)
from .openai_moderation import ModerationError, OpenAIModerationProvider

__all__ = [
    "GATE_VERSION",
    "GateResult",
    "InputGate",
    "ModerationError",
    "ModerationOutcome",
    "ModerationProvider",
    "OpenAIModerationProvider",
    "ReasonCode",
    "SafetyClearance",
    "Verdict",
    "content_digest",
    "mint_clearance",
]
