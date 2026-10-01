/**
 * Why an image of a result did not load (TASK-0077, audit UX-05).
 *
 * Every load error used to be explained as «la foto de tu cuerpo se borró a las 24 horas», even
 * for a generated anatomy that never expires, or for a dropped connection or an expired session.
 * The answer of the image's own address tells them apart; only a missing image that was composed
 * on the client's own photo is that photo's expiry.
 */
export type ImageFailure = 'photo_gone' | 'session' | 'unavailable' | 'retry';

export function imageFailure(status: number | null, fromOwnPhoto: boolean): ImageFailure {
  if (status === 401) return 'session';
  if (status === 404 || status === 410) return fromOwnPhoto ? 'photo_gone' : 'unavailable';
  // No answer (a dropped connection) or a server error: worth trying again.
  return 'retry';
}

export const IMAGE_FAILURE_TEXT: Record<ImageFailure, string> = {
  photo_gone:
    'La foto de tu cuerpo se borró a las 24 horas, y con ella esta vista sobre la piel. El diseño y la plantilla siguen aquí; sube otra foto si quieres volver a verlo puesto.',
  session: 'Tu sesión ha caducado. Vuelve a entrar para ver esta imagen.',
  unavailable: 'Esta imagen ya no está disponible. El diseño y la plantilla siguen aquí.',
  retry: 'No hemos podido cargar esta imagen. Comprueba tu conexión e inténtalo de nuevo.',
};

/** The status of an image's address, or `null` when it could not be reached at all. */
export async function probe(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.status;
  } catch {
    return null;
  }
}
