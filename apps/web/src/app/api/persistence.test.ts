/**
 * The consultation survives a web restart (TASK-0079, audit ARQ-01).
 *
 * A restart is simulated by emptying the process's consultation map: what comes back must come
 * from the worker, and only for the account that owns it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as newDesign, GET as read, POST as consult } from './consultation/route';
import {
  answerAuth,
  configureAuth,
  OTHER_ACCOUNT,
  signedIn,
  signedInAs,
} from '../../lib/auth.testing';

const memory = () =>
  (globalThis as typeof globalThis & { inkcraftSessions?: Map<string, unknown> }).inkcraftSessions!;

/** A worker that keeps consultations by id and owner, as the real one does. */
function keepingWorker(store: Map<string, { owner: string; data: unknown }>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const authenticated = answerAuth(target, init);
    if (authenticated) return authenticated;
    const owner = new Headers(init?.headers).get('X-Owner-Id') ?? '';
    const match = /\/studio\/consultations\/([0-9a-f-]{36})$/.exec(target);
    if (!match) throw new Error(`Unexpected request ${target}`);
    const id = match[1]!;
    if (init?.method === 'PUT') {
      store.set(id, { owner, data: JSON.parse(String(init.body)).data });
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'DELETE') {
      store.delete(id);
      return new Response(null, { status: 204 });
    }
    const kept = store.get(id);
    return kept && kept.owner === owner
      ? Response.json({ data: kept.data })
      : Response.json({ detail: 'Consulta no encontrada' }, { status: 404 });
  });
}

beforeEach(() => {
  configureAuth();
  vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('a consultation outlives the web process (TASK-0079)', () => {
  it('comes back from the worker after a restart, for its owner only', async () => {
    const store = new Map<string, { owner: string; data: unknown }>();
    vi.stubGlobal('fetch', keepingWorker(store));

    const started = await consult(
      new Request('http://localhost:3000/api/consultation', {
        method: 'POST',
        headers: { cookie: signedIn(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'orchestrate', userMessage: 'Un lobo en el gemelo' }),
      }),
    );
    expect(started.status).toBe(200);
    const sessionCookie = started.headers.get('set-cookie')!.split(';')[0]!;
    const sessionId = sessionCookie.split('=')[1]!;
    expect(store.has(sessionId)).toBe(true);

    // The web restarts: nothing in memory.
    memory().clear();
    const restored = await read(
      new Request('http://localhost:3000/api/consultation', {
        headers: { cookie: signedIn(sessionCookie) },
      }),
    );
    const body = await restored.json();
    expect(body.session?.sessionId).toBe(sessionId);
    expect(body.session?.slots.subject?.description).toContain('lobo');

    // Another account with the same cookie gets nothing.
    memory().clear();
    const stranger = await read(
      new Request('http://localhost:3000/api/consultation', {
        headers: { cookie: signedInAs(OTHER_ACCOUNT, sessionCookie) },
      }),
    );
    expect((await stranger.json()).session).toBeNull();

    // «Nuevo diseño» drops the kept copy too.
    await newDesign(
      new Request('http://localhost:3000/api/consultation', {
        method: 'DELETE',
        headers: { cookie: signedIn(sessionCookie) },
      }),
    );
    expect(store.has(sessionId)).toBe(false);
  });
});
