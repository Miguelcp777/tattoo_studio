"""Black Forest Labs FLUX.2 as the skin-background backend (TASK-0025, ADR-0009).

FLUX.2 renders photographic skin extremely well and will not render flat artwork on white:
asked for tattoo artwork it returns a photograph of the tattoo already applied to a limb, and
it holds that behaviour against explicit instruction (measured twice live, TASK-0025/ev-002).
Rather than fight the model with prompt restrictions, each vendor is routed to what it is
already good at. FLUX.2 draws the blank skin plate; OpenAI keeps the flat master, the edits,
reference analysis and output moderation.

BFL surface, per docs.bfl.ml (read 2026-09-22), confirmed live 2026-09-22:

  POST {base}/v1/{model}            header ``x-key``
  {"prompt", "input_image", "input_image_2".., "width", "height",
   "seed", "safety_tolerance", "output_format"}   -> {"id", "polling_url"}
  GET  {polling_url}                header ``x-key``
  -> {"status": "Pending" | "Ready" | "Request Moderated" | "Content Moderated"
       | "Error" | "Failed" | ..., "result": {"sample": <signed url, 10 min>}}

Invariants kept from ``StudioProvider``:
- No body photograph is ever an input here (ADR-0007). The background call is text-only, and
  it is only made when the client supplied no photograph of their own.
- No placeholder on failure and no implicit paid retry: every failure raises.
- The credential goes only to the configured API host, never to the result host,
  and never appears in an error message (SEC-INV-008).
"""

from __future__ import annotations

import base64
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

from .studio import StudioProvider

DEFAULT_BASE_URL = "https://api.eu.bfl.ai"
DEFAULT_BACKGROUND_MODEL = "flux-2-pro"
#: FLUX.2 API accepts at most 8 input images per request.
MAX_INPUT_IMAGES = 8
MAX_RESULT_BYTES = 30_000_000
_PENDING = {"Pending", "Queued", "Processing"}
_MODERATED = {"Request Moderated", "Content Moderated"}


def _trusted_bfl_url(url: object) -> bool:
    """Only HTTPS URLs on a bfl.ai / bfl.ml host are followed (no SSRF via response)."""
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return (
        parsed.scheme == "https"
        and not parsed.username
        and any(host == root or host.endswith("." + root) for root in ("bfl.ai", "bfl.ml"))
    )


class BflStudioProvider(StudioProvider):
    """``StudioProvider`` whose *skin background* is rendered by FLUX.2.

    Artwork, edits, vision analysis and output moderation are inherited unchanged from the
    OpenAI implementation, so ``image_model`` remains an OpenAI model name.
    """

    def __init__(
        self,
        openai_key: str,
        bfl_key: str,
        *,
        image_model: str = "gpt-image-2",
        vision_model: str = "gpt-4.1-mini",
        base_url: str = DEFAULT_BASE_URL,
        background_model: str = DEFAULT_BACKGROUND_MODEL,
        safety_tolerance: int = 2,
        poll_interval_s: float = 0.5,
        max_wait_s: float = 180.0,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        # image_model stays OpenAI's: the inherited artwork and edit paths post it to
        # api.openai.com. Passing a FLUX model name here would break every design.
        super().__init__(openai_key, image_model=image_model, vision_model=vision_model)
        if not bfl_key:
            raise ValueError("Configura BFL_API_KEY en el worker para generar con FLUX.2.")
        if not _trusted_bfl_url(base_url):
            raise ValueError("La URL base de BFL debe ser https://api[.eu|.us].bfl.ai.")
        self.bfl_key = bfl_key
        self.base_url = base_url.rstrip("/")
        self.background_model = background_model
        self.safety_tolerance = safety_tolerance
        self.poll_interval_s = poll_interval_s
        self.max_wait_s = max_wait_s
        self._sleep = sleep
        self._clock = clock

    def background(self, brief: dict[str, Any]) -> bytes:
        """The one call FLUX.2 serves: a blank skin plate, never the client's photograph."""
        return self.flux(self.background_model, self.background_prompt(brief), [], (1024, 1536))

    # ------------------------------------------------------------------
    # BFL protocol
    # ------------------------------------------------------------------

    def flux(self, model: str, prompt: str, images: list[bytes], size: tuple[int, int]) -> bytes:
        if len(images) > MAX_INPUT_IMAGES:
            raise ValueError(
                f"FLUX.2 admite como máximo {MAX_INPUT_IMAGES} imágenes por solicitud."
            )
        payload: dict[str, Any] = {
            "prompt": prompt,
            "width": size[0],
            "height": size[1],
            "safety_tolerance": self.safety_tolerance,
            "output_format": "png",
        }
        for index, data in enumerate(images):
            key = "input_image" if index == 0 else f"input_image_{index + 1}"
            payload[key] = base64.b64encode(data).decode()

        response = self.client.post(
            f"{self.base_url}/v1/{model}", json=payload, headers=self._headers()
        )
        self._check_bfl(response)
        polling_url = self._json(response).get("polling_url")
        if not _trusted_bfl_url(polling_url):
            raise ValueError("BFL devolvió una respuesta inválida.")
        return self.accept_output(self._download(self._poll(str(polling_url))))

    def _headers(self) -> dict[str, str]:
        return {"x-key": self.bfl_key, "accept": "application/json"}

    def _poll(self, polling_url: str) -> str:
        deadline = self._clock() + self.max_wait_s
        while True:
            response = self.client.get(polling_url, headers=self._headers())
            self._check_bfl(response)
            body = self._json(response)
            status = body.get("status")
            if status == "Ready":
                result = body.get("result")
                sample = result.get("sample") if isinstance(result, dict) else None
                if not _trusted_bfl_url(sample):
                    raise ValueError("BFL devolvió una imagen inválida.")
                return str(sample)
            if status in _MODERATED:
                raise ValueError("La comprobación de contenido de FLUX rechazó la solicitud.")
            if status not in _PENDING:
                raise ValueError("FLUX no ha completado la generación. No hay resultado válido.")
            if self._clock() >= deadline:
                raise ValueError("FLUX ha superado el tiempo máximo de espera.")
            self._sleep(self.poll_interval_s)

    def _download(self, url: str) -> bytes:
        # No x-key here: the signed delivery URL is its own authorisation.
        with self.client.stream("GET", url) as response:
            if response.status_code != 200:
                raise ValueError("No se ha podido descargar la imagen generada.")
            content = bytearray()
            for chunk in response.iter_bytes():
                content.extend(chunk)
                if len(content) > MAX_RESULT_BYTES:
                    raise ValueError("La imagen generada supera los límites admitidos.")
            return bytes(content)

    @staticmethod
    def _json(response: Any) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError as error:
            raise ValueError("BFL devolvió una respuesta inválida.") from error
        if not isinstance(body, dict):
            raise ValueError("BFL devolvió una respuesta inválida.")
        return body

    @staticmethod
    def _check_bfl(response: Any) -> None:
        status = response.status_code
        if status < 400:
            return
        if status == 402:
            raise ValueError("Sin créditos en Black Forest Labs. Recarga en dashboard.bfl.ai.")
        if status in (401, 403):
            raise ValueError("BFL rechazó la credencial (revisa BFL_API_KEY).")
        if status == 429:
            raise ValueError("BFL ha limitado la frecuencia de solicitudes. Reintenta más tarde.")
        raise ValueError(
            f"El proveedor no ha completado la solicitud ({status}). No se "
            "ha generado un resultado válido."
        )


__all__ = ["BflStudioProvider"]
