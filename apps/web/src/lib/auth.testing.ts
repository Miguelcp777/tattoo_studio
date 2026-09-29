/**
 * Test scaffolding for authentication (TASK-0045).
 *
 * The route tests drive the real guard rather than mocking it away, so each of them also proves
 * that its route refuses a caller without an account. What is faked here is only Supabase itself:
 * its address, its key, and its answer to "who holds this token".
 *
 * Not imported by any application module.
 */

import { vi } from 'vitest';

export const SUPABASE_ORIGIN = 'http://supabase.test';

/**
 * Two accounts, so a test can prove one cannot reach the other's work (TASK-0046). The ids are
 * UUIDs because that is what Supabase issues and what the worker accepts as an owner.
 */
export const TEST_ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@studio.test',
};
export const OTHER_ACCOUNT = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'other@studio.test',
};

/** An administrator: the role is in `app_metadata`, which only Supabase's admin access writes. */
export const ADMIN_ACCOUNT = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@studio.test',
  app_metadata: { role: 'admin' },
};

/** Someone who wrote the role into their own `user_metadata`, which any user can do. */
export const SELF_PROMOTED = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'mallory@studio.test',
  user_metadata: { role: 'admin' },
};

const ACCOUNTS = [TEST_ACCOUNT, OTHER_ACCOUNT, ADMIN_ACCOUNT, SELF_PROMOTED];

/** The access token a browser signed in as this account would hold. */
export function tokenFor(account: { id: string }): string {
  return `access-${account.id}`;
}

/** The access-token cookie a signed-in browser would send. */
export const ACCESS_COOKIE = `inkcraft_at=${tokenFor(TEST_ACCOUNT)}`;

/** Point the auth module at a Supabase that only exists inside the test. */
export function configureAuth(): void {
  vi.stubEnv('SUPABASE_URL', SUPABASE_ORIGIN);
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
}

/**
 * Answer the calls the auth module makes, or `undefined` so the test's own stub handles the rest.
 * A token minted by `tokenFor` identifies its account; any other token is accepted as the first
 * one, so a test that wants a refusal sends no cookie at all.
 */
export function answerAuth(url: string, init?: RequestInit): Response | undefined {
  if (!url.startsWith(`${SUPABASE_ORIGIN}/auth/v1`)) return undefined;
  if (url.endsWith('/user')) {
    const bearer = new Headers(init?.headers).get('Authorization');
    return Response.json(ACCOUNTS.find((a) => bearer === `Bearer ${tokenFor(a)}`) ?? TEST_ACCOUNT);
  }
  if (url.includes('grant_type=refresh_token'))
    return Response.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' });
  return new Response(null, { status: 400 });
}

/** A cookie header presenting a signed-in caller, plus whatever studio session is in play. */
export function signedIn(sessionCookie = ''): string {
  return [ACCESS_COOKIE, sessionCookie].filter(Boolean).join('; ');
}

/** The same, for a chosen account. */
export function signedInAs(account: { id: string }, sessionCookie = ''): string {
  return [`inkcraft_at=${tokenFor(account)}`, sessionCookie].filter(Boolean).join('; ');
}

/**
 * A `fetch` that authenticates and refuses anything else, for tests that make no other call.
 * Tests that do should compose `answerAuth` into their own stub instead.
 */
export function authOnlyFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const answer = answerAuth(String(url), init);
    if (answer) return answer;
    throw new Error(`Unexpected request in an auth-only test: ${String(url)}`);
  });
}
