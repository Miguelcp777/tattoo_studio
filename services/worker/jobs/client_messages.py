"""What the client is told when something fails (TASK-0072).

A failure used to reach the client as it was raised: «El proveedor no ha completado la solicitud
(400)», «FLUX ha superado el tiempo máximo de espera», «Line-art demasiado complejo…». The owner
asked that a design that cannot be made says so plainly, with no status codes or vendor names.

`for_client` is applied where a message leaves the worker for the client: a failed job's stored
error and an HTTP refusal. The original message is still recorded for the panel, which is where
the owner reads the technical cause. A message already written for the client passes unchanged.
"""

from __future__ import annotations

import re

GENERIC = (
    "No hemos podido terminar tu diseño. Vuelve a generarlo; si se repite, cambia un poco la "
    "descripción."
)
BUSY = "El estudio está tardando más de lo normal. Inténtalo de nuevo en unos minutos."
UNAVAILABLE = "El estudio no está disponible en este momento. Inténtalo de nuevo más tarde."
CONTENT = (
    "El generador de imágenes ha rechazado este diseño por su contenido. Cambia la descripción "
    "(sin contenido sexual explícito) e inténtalo de nuevo. No se ha generado nada."
)
STENCIL = (
    "No hemos podido sacar una plantilla limpia de este diseño. Vuelve a generarlo; si se repite, "
    "simplifica la idea."
)

#: Known messages whose wording was technical, said plainly.
REWRITES = {
    "Line-art demasiado complejo para un stencil fiable.": (
        "Tu diseño tiene demasiado detalle para una plantilla fiable. Simplifica la idea o aumenta "
        "el tamaño y vuelve a generarlo."
    ),
    "El proveedor no produjo line-art limpio. Reintenta con otro diseño.": STENCIL,
    "No se pueden extraer contornos suficientes del diseño a color.": STENCIL,
    "El trazado no contiene líneas utilizables.": STENCIL,
    "No se pudo completar el trabajo. No hay un resultado válido.": GENERIC,
    "No se ha podido analizar el contenido de las referencias.": (
        "No hemos podido analizar tus referencias. Vuelve a generarlo o cambia alguna referencia."
    ),
    "La comprobación de contenido de FLUX rechazó la solicitud.": CONTENT,
}

#: Marks of a message written for a developer: a status code, a vendor, a variable, a URL.
_TECHNICAL = re.compile(
    r"\(\d{3}\)|\bHTTP\b|\bBFL\b|FLUX|\bfal\b|\bAPI\b|_KEY\b|\bURL\b|JSON|https?://|"
    r"worker|proveedor|provider|credencial|dashboard|Traceback|Error\b",
    re.IGNORECASE,
)


def for_client(message: str) -> str:
    """The message to show the client for a failure raised as `message`."""
    text = message.strip()
    if not text:
        return GENERIC
    if text in REWRITES:
        return REWRITES[text]
    lowered = text.lower()
    if "tiempo máximo" in lowered or "timed out" in lowered or "limitado la frecuencia" in lowered:
        return BUSY
    if "créditos" in lowered or "credencial" in lowered or lowered.startswith("configura"):
        return UNAVAILABLE
    if _TECHNICAL.search(text):
        return GENERIC
    return text


__all__ = ["BUSY", "CONTENT", "GENERIC", "UNAVAILABLE", "for_client"]
