"""Token counts from provider responses, and what they cost (TASK-0054).

Tokens are what the providers report, read from their responses. Money is not: provider prices
change and are not in any response, so a cost is computed only from prices the owner configures
(``TATTOO_PRICES``). With none configured, events carry tokens and a null cost, never a guess.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


def tokens(body: Any) -> tuple[int | None, int | None]:
    """(input, output) tokens from an OpenAI or Anthropic response body, if it reports them."""
    usage = body.get("usage") if isinstance(body, dict) else None
    if not isinstance(usage, dict):
        return None, None

    def number(*keys: str) -> int | None:
        for key in keys:
            value = usage.get(key)
            if isinstance(value, int | float) and not isinstance(value, bool):
                return int(value)
        return None

    # Responses and Images APIs say input/output; Chat Completions says prompt/completion.
    return number("input_tokens", "prompt_tokens"), number("output_tokens", "completion_tokens")


@dataclass(frozen=True)
class Price:
    input_per_million: float = 0.0
    output_per_million: float = 0.0
    per_image: float = 0.0


class Prices:
    """USD per model, from ``TATTOO_PRICES``: ``{"model": {"input_per_million": .., ...}}``."""

    def __init__(self, table: dict[str, Price] | None = None) -> None:
        self._table = table or {}

    @classmethod
    def parse(cls, raw: str | None) -> Prices:
        if not raw:
            return cls()
        try:
            data = json.loads(raw)
        except ValueError as error:
            raise ValueError("TATTOO_PRICES no es JSON válido.") from error
        if not isinstance(data, dict):
            raise ValueError("TATTOO_PRICES debe ser un objeto {modelo: precios}.")
        table: dict[str, Price] = {}
        for model, entry in data.items():
            if not isinstance(entry, dict) or not set(entry) <= set(Price.__dataclass_fields__):
                raise ValueError(f"Precio mal formado para {model!r} en TATTOO_PRICES.")
            table[str(model)] = Price(**{key: float(value) for key, value in entry.items()})
        return cls(table)

    def cost(
        self,
        model: str | None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        images: int | None = None,
    ) -> float | None:
        """The estimated cost, or None when this model has no configured price."""
        price = self._table.get(model or "")
        if price is None:
            return None
        return round(
            (input_tokens or 0) * price.input_per_million / 1_000_000
            + (output_tokens or 0) * price.output_per_million / 1_000_000
            + (images or 0) * price.per_image,
            6,
        )


#: Set by the worker at startup; tests replace it.
PRICES = Prices()


def configure_prices(prices: Prices) -> None:
    global PRICES
    PRICES = prices
