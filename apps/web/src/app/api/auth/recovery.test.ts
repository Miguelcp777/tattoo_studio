import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as setPassword } from './password/route';
import { POST as recover } from './recover/route';
import { configureAuth, SUPABASE_ORIGIN } from '../../../lib/auth.testing';

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(
    new Request('https://inkcraft.test/api/auth/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => configureAuth());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('password recovery (TASK-0081, audit UX-04)', () => {
  it('asks Supabase for a link back to /restablecer, and answers the same for any address', async () => {
    const fetch = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({}),
    );
    vi.stubGlobal('fetch', fetch);
    const answer = await post(recover, { email: 'alguien@ejemplo.es' });
    expect(answer.status).toBe(200);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      `${SUPABASE_ORIGIN}/auth/v1/recover?redirect_to=${encodeURIComponent('https://inkcraft.test/restablecer')}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'alguien@ejemplo.es' });

    // Supabase refusing an unknown address changes nothing the visitor sees.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 404 })),
    );
    expect((await post(recover, { email: 'nadie@ejemplo.es' })).status).toBe(200);
  });

  it('refuses something that is not an address', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const answer = await post(recover, { email: 'no es un correo' });
    expect(answer.status).toBe(400);
  });

  it('sets the new password with the link token', async () => {
    const fetch = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({}),
    );
    vi.stubGlobal('fetch', fetch);
    const answer = await post(setPassword, { accessToken: 'token', password: 'una-clave-larga' });
    expect(answer.status).toBe(200);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`${SUPABASE_ORIGIN}/auth/v1/user`);
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
  });

  it('says plainly when the password is too short or the link has expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 401 })),
    );
    const short = await post(setPassword, { accessToken: 'token', password: 'corta' });
    expect(short.status).toBe(400);
    expect((await short.json()).error).toContain('8');
    const expired = await post(setPassword, { accessToken: 'old', password: 'una-clave-larga' });
    expect(expired.status).toBe(401);
    expect((await expired.json()).error).toContain('caducado');
  });
});
