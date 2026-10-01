/**
 * Stored work belongs to the account, not to the browser (TASK-0046).
 *
 * The worker scopes every asset, job and vector master by an opaque owner string. These tests are
 * about which string the web tier sends: it used to be the consultation session id, which made the
 * same person on a second device a stranger to their own designs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as consultation, POST as consult } from './consultation/route';
import { GET as readJobs } from './generate/route';
import { DELETE as eraseAll, GET as readMedia, POST as upload } from './media/route';
import {
  answerAuth,
  OTHER_ACCOUNT,
  signedIn,
  signedInAs,
  TEST_ACCOUNT,
  configureAuth,
} from '../../lib/auth.testing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

interface Call {
  url: string;
  owner: string | null;
}

/** A worker that records who each call claimed to be for. */
function workerSpy(calls: Call[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const authenticated = answerAuth(target, init);
    if (authenticated) return authenticated;
    calls.push({ url: target, owner: new Headers(init?.headers).get('X-Owner-Id') });
    if (target.includes('/studio/jobs'))
      return Response.json(
        target.endsWith('/studio/jobs')
          ? [{ jobId: 'b'.repeat(32), state: 'queued', result: null, error: null }]
          : { jobId: 'b'.repeat(32), state: 'queued', result: null, error: null },
      );
    if (target.includes('/studio/media'))
      return Response.json({ assetId: 'a'.repeat(32), mimeType: 'image/png' });
    if (target.endsWith('/studio/session')) return Response.json({ deleted: true });
    throw new Error(`Unexpected request ${target}`);
  });
}

const history = (cookie: string) =>
  readJobs(new Request('http://localhost:3000/api/generate?history=true', { headers: { cookie } }));

beforeEach(() => {
  configureAuth();
  vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
});

describe('who owns the work (TASK-0046)', () => {
  it('tells the worker the account id, never the browser session', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', workerSpy(calls));

    // A studio session cookie is present and must not be what identifies the owner.
    const cookie = signedIn('inkcraft=99999999-9999-4999-8999-999999999999');
    expect((await history(cookie)).status).toBe(200);
    expect(
      (
        await readMedia(
          new Request(`http://localhost:3000/api/media?id=${'a'.repeat(32)}`, {
            headers: { cookie },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await upload(
          new Request('http://localhost:3000/api/media', {
            method: 'POST',
            headers: { cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'reference', data: 'AQID', adult: true, consent: true }),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await eraseAll(
          new Request('http://localhost:3000/api/media', {
            method: 'DELETE',
            headers: { cookie, 'Content-Type': 'application/json' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(200);

    // AC-001: every call, whatever it was for.
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) expect(call.owner).toBe(TEST_ACCOUNT.id);
    // TASK-0079: the consultation is kept under its own id, still owned by the account header;
    // nothing else the worker is told carries the browser's session.
    const work = calls.filter((call) => !call.url.includes('/studio/consultations/'));
    expect(JSON.stringify(work)).not.toContain('99999999-9999-4999-8999-999999999999');
  });

  it('keeps one account out of another, even with the same studio session', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', workerSpy(calls));

    // The same browser session cookie, two different accounts: the owner must follow the account.
    const shared = 'inkcraft=99999999-9999-4999-8999-999999999999';
    expect((await history(signedInAs(TEST_ACCOUNT, shared))).status).toBe(200);
    expect((await history(signedInAs(OTHER_ACCOUNT, shared))).status).toBe(200);

    // AC-002: two owners, not one.
    expect(calls.map((call) => call.owner)).toEqual([TEST_ACCOUNT.id, OTHER_ACCOUNT.id]);
  });

  it('reads the account work without a consultation in progress', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', workerSpy(calls));

    // AC-003: no `inkcraft` cookie at all — a device that has only just signed in.
    const listed = await history(signedIn());
    expect(listed.status).toBe(200);
    expect(await listed.json()).toHaveLength(1);

    const status = await readJobs(
      new Request(`http://localhost:3000/api/generate?id=${'b'.repeat(32)}`, {
        headers: { cookie: signedIn() },
      }),
    );
    expect(status.status).toBe(200);
    expect((await status.json()).jobId).toBe('b'.repeat(32));

    const image = await readMedia(
      new Request(`http://localhost:3000/api/media?id=${'a'.repeat(32)}`, {
        headers: { cookie: signedIn() },
      }),
    );
    expect(image.status).toBe(200);
    for (const call of calls) expect(call.owner).toBe(TEST_ACCOUNT.id);
  });

  it('erasing everything works with no consultation to clear', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', workerSpy(calls));

    // AC-004, web side: deletion is about the account, so it does not need a browser session.
    const response = await eraseAll(
      new Request('http://localhost:3000/api/media', {
        method: 'DELETE',
        headers: { cookie: signedIn(), 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      { url: expect.stringContaining('/studio/session'), owner: TEST_ACCOUNT.id },
    ]);
  });
});

describe('the conversation in a shared browser (TASK-0049)', () => {
  it('is never handed to a different account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const authenticated = answerAuth(target, init);
        if (authenticated) return authenticated;
        if (target.includes('commons.wikimedia.org/w/api')) return Response.json({ query: {} });
        throw new Error(`Unexpected request ${target}`);
      }),
    );
    const read = (cookie: string) =>
      consultation(new Request('http://localhost:3000/api/consultation', { headers: { cookie } }));
    const talk = (cookie: string) =>
      consult(
        new Request('http://localhost:3000/api/consultation', {
          method: 'POST',
          headers: { cookie },
          body: JSON.stringify({ action: 'orchestrate', userMessage: 'Un lobo en el antebrazo' }),
        }),
      );

    // The first person starts a consultation; the browser now holds its cookie.
    const started = await talk(signedInAs(TEST_ACCOUNT));
    expect(started.status).toBe(200);
    const browser = started.headers.getSetCookie().find((c) => c.startsWith('inkcraft='))!;
    const shared = browser.split(';')[0]!;
    expect((await (await read(signedInAs(TEST_ACCOUNT, shared))).json()).session).not.toBeNull();

    // Someone else signs in on the same browser: they see no conversation at all.
    expect((await (await read(signedInAs(OTHER_ACCOUNT, shared))).json()).session).toBeNull();

    // If they start talking, it is a new consultation, not a continuation of the first one.
    const theirs = await talk(signedInAs(OTHER_ACCOUNT, shared));
    expect(theirs.status).toBe(200);
    const theirCookie = theirs.headers.getSetCookie().find((c) => c.startsWith('inkcraft='))!;
    expect(theirCookie.split(';')[0]).not.toBe(shared);

    // And the first person's conversation is untouched.
    expect((await (await read(signedInAs(TEST_ACCOUNT, shared))).json()).session).not.toBeNull();
  });
});
