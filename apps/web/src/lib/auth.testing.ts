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

/** The access-token cookie a signed-in browser would send. */
export const ACCESS_COOKIE = 'inkcraft_at=test-access-token';

export const TEST_ACCOUNT = { id: 'account-1', email: 'owner@studio.test' };

/** Point the auth module at a Supabase that only exists inside the test. */
export function configureAuth(): void {
  vi.stubEnv('SUPABASE_URL', SUPABASE_ORIGIN);
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
}

/**
 * Answer the calls the auth module makes, or `undefined` so the test's own stub handles the rest.
 * Any token is accepted: a test that wants a refusal sends no cookie at all.
 */
export function answerAuth(url: string): Response | undefined {
  if (!url.startsWith(`${SUPABASE_ORIGIN}/auth/v1`)) return undefined;
  if (url.endsWith('/user')) return Response.json(TEST_ACCOUNT);
  if (url.includes('grant_type=refresh_token'))
    return Response.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh' });
  return new Response(null, { status: 400 });
}

/** A cookie header presenting a signed-in caller, plus whatever studio session is in play. */
export function signedIn(sessionCookie = ''): string {
  return [ACCESS_COOKIE, sessionCookie].filter(Boolean).join('; ');
}

/**
 * A `fetch` that authenticates and refuses anything else, for tests that make no other call.
 * Tests that do should compose `answerAuth` into their own stub instead.
 */
export function authOnlyFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request) => {
    const answer = answerAuth(String(url));
    if (answer) return answer;
    throw new Error(`Unexpected request in an auth-only test: ${String(url)}`);
  });
}
