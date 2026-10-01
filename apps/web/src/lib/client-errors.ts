/**
 * What the client reads when a request fails (TASK-0072).
 *
 * The owner asked for plain messages: no status codes, vendor names or programming errors. The
 * worker already words its failures for the client (`jobs/client_messages.py`); this is the same
 * rule in the browser, for what the worker cannot word: a dropped connection, a proxy page that is
 * not JSON, an expired session, or a technical message that slipped through.
 */

export const GENERIC_FAILURE =
  'No hemos podido completar la solicitud. Inténtalo de nuevo en unos segundos.';
export const NETWORK_FAILURE =
  'No hay conexión con el estudio. Comprueba tu conexión e inténtalo de nuevo.';
export const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a entrar.';
export const TOO_LARGE = 'El archivo es demasiado grande. Usa una imagen de menos de 8 MB.';
export const BUSY =
  'El estudio tiene mucha demanda ahora mismo. Inténtalo de nuevo en unos minutos.';

/** Marks of a message written for a developer. The same rule as the worker's. */
const TECHNICAL =
  /\(\d{3}\)|\bHTTP\b|\bBFL\b|FLUX|\bfal\b|\bAPI\b|_KEY\b|\bURL\b|JSON|https?:\/\/|worker|proveedor|provider|credencial|dashboard|Error\b|Unexpected token|Failed to fetch|NetworkError/i;

export function isPlain(message: unknown): message is string {
  return typeof message === 'string' && message.trim().length > 0 && !TECHNICAL.test(message);
}

/** The message for a response that was not ok, from its status and its body if it had one. */
export function messageForResponse(status: number, body: unknown): string {
  const said = (body as { error?: unknown } | null)?.error;
  if (status === 401) return SESSION_EXPIRED;
  if (isPlain(said)) return said;
  if (status === 413) return TOO_LARGE;
  if (status === 429) return BUSY;
  return GENERIC_FAILURE;
}

/** The message for anything thrown while talking to the studio. */
export function messageForError(error: unknown): string {
  // A fetch that never reached the server throws a TypeError ("Failed to fetch").
  if (error instanceof TypeError) return NETWORK_FAILURE;
  if (error instanceof Error && isPlain(error.message)) return error.message;
  if (isPlain(error)) return error;
  return GENERIC_FAILURE;
}

/** The body of a response, or an empty object when it is not JSON (a proxy's error page). */
export async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
