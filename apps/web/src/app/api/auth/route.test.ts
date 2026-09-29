import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from './route';
import { GET as consultation } from '../consultation/route';
import { displayName } from '../../../lib/auth';
import { configureAuth, SUPABASE_ORIGIN, TEST_ACCOUNT } from '../../../lib/auth.testing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(configureAuth);

const login = (body: unknown, origin?: string) =>
  new Request('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'localhost:3000',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

const cookies = (response: Response): string[] => response.headers.getSetCookie();
const cookieFor = (response: Response, name: string): string =>
  cookies(response).find((value) => value.startsWith(`${name}=`)) ?? '';

describe('signing in (TASK-0045)', () => {
  it('exchanges credentials for cookies the page cannot read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ access_token: 'access-1', refresh_token: 'refresh-1' })),
    );
    const response = await POST(login({ email: 'owner@studio.test', password: 'correct horse' }));
    expect(response.status).toBe(200);

    const access = cookieFor(response, 'inkcraft_at');
    const refresh = cookieFor(response, 'inkcraft_rt');
    expect(access).toContain('access-1');
    expect(refresh).toContain('refresh-1');
    // The token is the credential; script on the page must never be able to read it.
    for (const cookie of [access, refresh]) {
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=strict/i);
    }
    // Nothing about the account is echoed into the body.
    expect(await response.json()).toEqual({ ok: true });
  });

  it('says the same thing for an unknown address and a wrong password', async () => {
    // Telling them apart is an account-enumeration oracle.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    const unknown = await POST(login({ email: 'nobody@studio.test', password: 'x' }));
    const wrong = await POST(login({ email: 'owner@studio.test', password: 'wrong' }));
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
    expect(cookies(unknown)).toEqual([]);
  });

  it('refuses a cross-site submission and an incomplete one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const foreign = await POST(
      login({ email: 'owner@studio.test', password: 'x' }, 'https://evil.test'),
    );
    expect(foreign.status).toBe(403);
    expect((await POST(login({ email: 'owner@studio.test' }))).status).toBe(400);
    expect((await POST(login({}))).status).toBe(400);
  });

  it('reports an unreachable account service as such, not as a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect((await POST(login({ email: 'a@b.test', password: 'x' }))).status).toBe(503);
  });

  const signOut = (cookie?: string) =>
    DELETE(
      new Request('http://localhost:3000/api/auth', {
        method: 'DELETE',
        ...(cookie ? { headers: { cookie } } : {}),
      }),
    );

  it('signing out ends the session at Supabase and clears every cookie (TASK-0049)', async () => {
    const calls: { url: string; bearer: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), bearer: new Headers(init?.headers).get('Authorization') });
        return new Response(null, { status: 204 });
      }),
    );
    const response = await signOut('inkcraft_at=access-1; inkcraft_rt=refresh-1; inkcraft=abc');
    expect(response.status).toBe(200);
    // The refresh token stops working, rather than merely being forgotten by this browser.
    expect(calls).toEqual([
      { url: `${SUPABASE_ORIGIN}/auth/v1/logout?scope=local`, bearer: 'Bearer access-1' },
    ]);
    // Both tokens and the consultation go: the next person on this browser starts clean.
    for (const name of ['inkcraft_at', 'inkcraft_rt', 'inkcraft'])
      expect(cookieFor(response, name)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('signing out still works when Supabase cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const response = await signOut('inkcraft_at=access-1');
    expect(response.status).toBe(200);
    expect(cookieFor(response, 'inkcraft_at')).toMatch(/Max-Age=0/i);
    // And with no session at all there is nothing to revoke and nothing to fail.
    expect((await signOut()).status).toBe(200);
  });

  it('reports who is signed in, and nobody when the cookie is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(TEST_ACCOUNT)),
    );
    const signed = await GET(
      new Request('http://localhost:3000/api/auth', { headers: { cookie: 'inkcraft_at=t' } }),
    );
    // TASK-0049: a name to greet them by; the account id stays on the server.
    expect((await signed.json()).account).toEqual({
      email: TEST_ACCOUNT.email,
      displayName: 'owner',
    });

    const anonymous = await GET(new Request('http://localhost:3000/api/auth'));
    expect((await anonymous.json()).account).toBeNull();
  });

  it('greets by the name set on the account when there is one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...TEST_ACCOUNT, user_metadata: { full_name: 'Miguel' } })),
    );
    const signed = await GET(
      new Request('http://localhost:3000/api/auth', { headers: { cookie: 'inkcraft_at=t' } }),
    );
    expect((await signed.json()).account.displayName).toBe('Miguel');
  });
});

describe('what to call someone (TASK-0049)', () => {
  it('prefers the account name, then the address before the @, never the whole address', () => {
    expect(displayName({ name: '  Ana  ', email: 'ana.lopez@example.com' })).toBe('Ana');
    expect(displayName({ name: '', email: 'ana.lopez@example.com' })).toBe('ana.lopez');
    expect(displayName({ email: 'ana.lopez@example.com' })).not.toContain('@');
    expect(displayName({ email: undefined })).toBe('de nuevo');
    expect(displayName({ name: 'x'.repeat(200), email: undefined })).toHaveLength(60);
  });
});

describe('an expired access token (TASK-0045)', () => {
  it('is renewed from the refresh token, and the new pair is re-issued', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        seen.push(target);
        if (target === `${SUPABASE_ORIGIN}/auth/v1/user`) {
          const bearer = new Headers(init?.headers).get('Authorization');
          // The stale token is rejected; the renewed one identifies the account.
          return bearer === 'Bearer renewed-access'
            ? Response.json(TEST_ACCOUNT)
            : new Response(null, { status: 401 });
        }
        if (target.includes('grant_type=refresh_token'))
          return Response.json({
            access_token: 'renewed-access',
            refresh_token: 'renewed-refresh',
          });
        throw new Error(`Unexpected request ${target}`);
      }),
    );

    const response = await consultation(
      new Request('http://localhost:3000/api/consultation', {
        headers: { cookie: 'inkcraft_at=stale; inkcraft_rt=still-good' },
      }),
    );

    expect(response.status).toBe(200);
    expect(cookieFor(response, 'inkcraft_at')).toContain('renewed-access');
    expect(cookieFor(response, 'inkcraft_rt')).toContain('renewed-refresh');
    expect(seen.some((url) => url.includes('grant_type=refresh_token'))).toBe(true);
  });

  it('with no usable refresh token, the caller is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    const response = await consultation(
      new Request('http://localhost:3000/api/consultation', {
        headers: { cookie: 'inkcraft_at=stale; inkcraft_rt=revoked' },
      }),
    );
    expect(response.status).toBe(401);
  });
});
