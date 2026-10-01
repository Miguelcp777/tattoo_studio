import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { POST as generate } from '../generate/route';
import { POST as upload } from '../media/route';
import {
  ACCEPTED,
  authOnlyFetch,
  configureAuth,
  consentFor,
  signedInWithoutConsent,
  TEST_ACCOUNT,
} from '../../../lib/auth.testing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  configureAuth();
  vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
  // Only Supabase answers: anything reaching the worker fails the test.
  vi.stubGlobal('fetch', authOnlyFetch());
});

const post = (
  handler: (r: Request) => Promise<Response>,
  path: string,
  body: unknown,
  cookie?: string,
) =>
  handler(
    new Request(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );

describe('consent given at sign-in (TASK-0064, ADR-0028)', () => {
  it('a session that has not accepted cannot upload or generate', async () => {
    const cookie = signedInWithoutConsent();
    const media = await post(upload, '/api/media', { data: 'AQID', kind: 'reference' }, cookie);
    const job = await post(generate, '/api/generate', { idempotencyKey: 'x' }, cookie);
    for (const response of [media, job]) {
      expect(response.status).toBe(428);
      expect((await response.json()).error).toContain('Acepta las condiciones');
    }
  });

  it('an open session accepts once, for the current versions, and gets the cookie', async () => {
    const cookie = signedInWithoutConsent();
    expect((await post(POST, '/api/consent', {}, cookie)).status).toBe(400);
    expect(
      (await post(POST, '/api/consent', { accepted: { ...ACCEPTED, terms: 'old' } }, cookie))
        .status,
    ).toBe(400);
    const accepted = await post(POST, '/api/consent', { accepted: ACCEPTED }, cookie);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.getSetCookie().join(';')).toContain(consentFor(TEST_ACCOUNT));
  });

  it('a stranger cannot accept for anyone', async () => {
    expect((await post(POST, '/api/consent', { accepted: ACCEPTED })).status).toBe(401);
  });

  it("one account's consent does not carry to another", async () => {
    const other = { id: '22222222-2222-4222-8222-222222222222' };
    const forged = `inkcraft_at=access-${other.id}; ${consentFor(TEST_ACCOUNT)}`;
    const response = await post(upload, '/api/media', { data: 'AQID', kind: 'reference' }, forged);
    expect(response.status).toBe(428);
  });
});
