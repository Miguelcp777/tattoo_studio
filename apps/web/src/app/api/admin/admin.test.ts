/**
 * The administrator's routes (TASK-0055).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as account } from './accounts/[account]/route';
import { GET as media } from './media/route';
import { GET as overview } from './overview/route';
import {
  ADMIN_ACCOUNT,
  answerAuth,
  configureAuth,
  SELF_PROMOTED,
  signedInAs,
  TEST_ACCOUNT,
} from '../../../lib/auth.testing';

interface Call {
  url: string;
  admin: string | null;
}

let calls: Call[] = [];

function worker(status = 200, body: unknown = { totals: {} }): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const answered = answerAuth(target, init);
    if (answered) return answered;
    calls.push({ url: target, admin: new Headers(init?.headers).get('X-Admin-Id') });
    return Response.json(body, { status });
  });
}

beforeEach(() => {
  configureAuth();
  vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const get = (path: string, cookie?: string) =>
  new Request(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : {});
const params = (id: string) => ({ params: Promise.resolve({ account: id }) });

const everyRoute = (cookie?: string) => [
  overview(get('/api/admin/overview', cookie)),
  account(get(`/api/admin/accounts/${TEST_ACCOUNT.id}`, cookie), params(TEST_ACCOUNT.id)),
  media(get(`/api/admin/media?id=${'a'.repeat(32)}`, cookie)),
];

describe('the administrator panel (TASK-0055)', () => {
  it('refuses a stranger and an ordinary account, before reaching the worker', async () => {
    vi.stubGlobal('fetch', worker());
    for (const response of await Promise.all(everyRoute())) expect(response.status).toBe(401);
    for (const response of await Promise.all(everyRoute(signedInAs(TEST_ACCOUNT))))
      expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('refuses someone who wrote the role into their own metadata', async () => {
    // user_metadata is writable by the user themselves; only app_metadata can grant the role.
    vi.stubGlobal('fetch', worker());
    for (const response of await Promise.all(everyRoute(signedInAs(SELF_PROMOTED))))
      expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('lets an administrator through, as themself, for the audit trail', async () => {
    vi.stubGlobal('fetch', worker());
    const answers = await Promise.all(everyRoute(signedInAs(ADMIN_ACCOUNT)));
    expect(answers.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(calls.map((call) => call.admin)).toEqual([
      ADMIN_ACCOUNT.id,
      ADMIN_ACCOUNT.id,
      ADMIN_ACCOUNT.id,
    ]);
    // The three routes run concurrently, so they reach the worker in any order.
    expect(calls.map((call) => new URL(call.url).pathname).sort()).toEqual(
      [
        '/studio/admin/overview',
        `/studio/admin/accounts/${TEST_ACCOUNT.id}`,
        `/studio/admin/media/${'a'.repeat(32)}`,
      ].sort(),
    );
  });

  it('keeps the range within a year and refuses a malformed account', async () => {
    vi.stubGlobal('fetch', worker());
    const cookie = signedInAs(ADMIN_ACCOUNT);
    await overview(get('/api/admin/overview?days=99999', cookie));
    await overview(get('/api/admin/overview?days=-3', cookie));
    expect(calls.map((call) => new URL(call.url).searchParams.get('days'))).toEqual(['365', '1']);
    const bad = await account(get('/api/admin/accounts/nobody', cookie), params('nobody'));
    expect(bad.status).toBe(404);
  });

  it("passes on the worker's refusal to show a body", async () => {
    vi.stubGlobal(
      'fetch',
      worker(403, { detail: 'Las fotos del cuerpo no se muestran al administrador.' }),
    );
    const refused = await media(
      get(`/api/admin/media?id=${'b'.repeat(32)}`, signedInAs(ADMIN_ACCOUNT)),
    );
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toMatch(/fotos del cuerpo/);
  });
});
