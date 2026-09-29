import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as consult, GET as consultGet } from './consultation/route';
import { POST as generate, GET as generateGet } from './generate/route';
import { POST as keepPhoto } from './captures/route';
import { POST as upload, GET as media, DELETE as forget } from './media/route';
import { answerAuth, authOnlyFetch, configureAuth, signedIn } from '../../lib/auth.testing';

/**
 * TASK-0045/ADR-0021: the routes that spend money or read stored work refuse a caller without an
 * account. This is the property the whole task exists for — before it, anyone who found the URL
 * could run generations on the owner's credits.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const url = (path: string) => `http://localhost:3000/api/${path}`;
const post = (path: string, cookie?: string) =>
  new Request(url(path), {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: JSON.stringify({ action: 'start', idea: 'Un león' }),
  });

describe('every paid or private route requires an account', () => {
  beforeEach(() => {
    configureAuth();
    vi.stubGlobal('fetch', authOnlyFetch());
  });

  it.each([
    ['consultation', () => consult(post('consultation'))],
    ['generate', () => generate(post('generate'))],
    ['media upload', () => upload(post('media'))],
    // TASK-0050: a kept camera photo is screened by a paid moderation call and stored.
    ['kept photo', () => keepPhoto(post('captures'))],
  ])('refuses an unauthenticated POST to %s', async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/Inicia sesión/);
  });

  it.each([
    ['consultation', () => consultGet(new Request(url('consultation')))],
    ['generate history', () => generateGet(new Request(`${url('generate')}?history=true`))],
    ['media', () => media(new Request(`${url('media')}?id=${'a'.repeat(32)}`))],
    ['deletion', () => forget(new Request(url('media'), { method: 'DELETE', body: '{}' }))],
  ])('refuses an unauthenticated read of %s', async (_name, call) => {
    expect((await call()).status).not.toBe(200);
  });

  it('never reaches the worker or a model for an unauthenticated caller', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (target: string | URL | Request) => {
        calls.push(String(target));
        return new Response(null, { status: 500 });
      }),
    );
    expect((await generate(post('generate'))).status).toBe(401);
    expect((await consult(post('consultation'))).status).toBe(401);
    expect((await keepPhoto(post('captures'))).status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe('a deployment without authentication configured', () => {
  it('refuses everyone rather than letting everyone in', async () => {
    // PLAT-INV-005: a studio that cannot tell who is asking must say no. Opening the door would
    // be the far more dangerous failure, and a misconfiguration is exactly when it would happen.
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubGlobal('fetch', authOnlyFetch());
    const response = await consult(post('consultation', signedIn()));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/autenticación no está configurada/);
  });
});

describe('a signed-in caller is let through', () => {
  it('reaches the route logic instead of the guard', async () => {
    configureAuth();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (target: string | URL | Request) => {
        const answered = answerAuth(String(target));
        if (answered) return answered;
        return Response.json({ query: { pages: {} } });
      }),
    );
    const response = await consult(post('consultation', signedIn()));
    expect(response.status).toBe(200);
  });
});
