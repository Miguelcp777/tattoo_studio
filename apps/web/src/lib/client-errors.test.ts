import { describe, expect, it } from 'vitest';

import {
  BUSY,
  GENERIC_FAILURE,
  NETWORK_FAILURE,
  SESSION_EXPIRED,
  TOO_LARGE,
  bodyOf,
  isPlain,
  messageForError,
  messageForResponse,
} from './client-errors';

describe('plain words for every failure (TASK-0072)', () => {
  it('keeps a message written for the client', () => {
    const said = 'Revisa el ancho y el alto: ambos deben estar entre 5 y 600 mm.';
    expect(messageForResponse(422, { error: said })).toBe(said);
    expect(messageForError(new Error(said))).toBe(said);
  });

  it('never shows a status code, a vendor or a programming error', () => {
    for (const technical of [
      'El proveedor no ha completado la solicitud (400). No se ha generado un resultado válido.',
      'FLUX ha superado el tiempo máximo de espera.',
      'El worker rechazó la solicitud.',
      'SyntaxError: Unexpected token < in JSON at position 0',
      'Configura OPENAI_API_KEY en el worker.',
    ]) {
      expect(isPlain(technical)).toBe(false);
      expect(messageForResponse(500, { error: technical })).toBe(GENERIC_FAILURE);
      expect(messageForError(new Error(technical))).toBe(GENERIC_FAILURE);
    }
  });

  it('words what the server could not', () => {
    expect(messageForResponse(401, { error: 'No autorizado' })).toBe(SESSION_EXPIRED);
    expect(messageForResponse(413, {})).toBe(TOO_LARGE);
    expect(messageForResponse(429, {})).toBe(BUSY);
    expect(messageForResponse(502, {})).toBe(GENERIC_FAILURE);
    expect(messageForResponse(500, null)).toBe(GENERIC_FAILURE);
  });

  it('says a dropped connection is a connection problem', () => {
    expect(messageForError(new TypeError('Failed to fetch'))).toBe(NETWORK_FAILURE);
    expect(messageForError(undefined)).toBe(GENERIC_FAILURE);
  });

  it('reads a proxy error page as an empty body instead of throwing', async () => {
    expect(await bodyOf(new Response('<html>Bad gateway</html>', { status: 502 }))).toEqual({});
    expect(await bodyOf(Response.json({ error: 'x' }))).toEqual({ error: 'x' });
  });
});
