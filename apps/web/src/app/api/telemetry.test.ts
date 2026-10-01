/**
 * What the web tier reports for monitoring (TASK-0054).
 */

import { reportUsage } from '@tattoo/consultation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as signIn } from './auth/route';
import { POST as consult } from './consultation/route';
import {
  ACCEPTED,
  answerAuth,
  configureAuth,
  signedInAs,
  SUPABASE_ORIGIN,
  TEST_ACCOUNT,
} from '../../lib/auth.testing';
import { attribute, routeEvents, type WebEvent } from '../../lib/telemetry';

interface Sent {
  event: WebEvent;
  account: string | undefined;
}

let sent: Sent[] = [];

beforeEach(() => {
  configureAuth();
  sent = [];
  routeEvents((event, account) => sent.push({ event, account }));
});
afterEach(() => {
  routeEvents(() => undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const talk = (message: string) =>
  consult(
    new Request('http://localhost:3000/api/consultation', {
      method: 'POST',
      headers: { cookie: signedInAs(TEST_ACCOUNT) },
      body: JSON.stringify({ action: 'orchestrate', userMessage: message }),
    }),
  );

describe('monitoring from the web tier (TASK-0054)', () => {
  it('records a consultation turn as the account, with what was said and answered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const answered = answerAuth(String(url), init);
        if (answered) return answered;
        return Response.json({ query: {} });
      }),
    );

    expect((await talk('Un lobo en el antebrazo')).status).toBe(200);

    const turns = sent.filter((s) => s.event.kind === 'consultation_turn');
    expect(turns.map((s) => s.event.operation)).toEqual(['message', 'reply']);
    expect(turns.every((s) => s.account === TEST_ACCOUNT.id)).toBe(true);
    expect(turns[0]!.event.text).toBe('Un lobo en el antebrazo');
    expect(turns[1]!.event.text?.length).toBeGreaterThan(0);
  });

  it('forwards a model call as the account whose request made it', () => {
    attribute(TEST_ACCOUNT.id);
    reportUsage({
      provider: 'anthropic',
      operation: 'consultation',
      model: 'claude-test',
      outcome: 'ok',
      durationMs: 850,
      inputTokens: 1200,
      outputTokens: 90,
    });
    expect(sent).toEqual([
      {
        account: TEST_ACCOUNT.id,
        event: {
          kind: 'provider_call',
          operation: 'consultation',
          provider: 'anthropic',
          model: 'claude-test',
          outcome: 'ok',
          duration_ms: 850,
          input_tokens: 1200,
          output_tokens: 90,
        },
      },
    ]);
  });

  it('counts sign-ins, and a refused one without the address or an account', async () => {
    const attempt = (email: string) =>
      signIn(
        new Request('http://localhost:3000/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', host: 'localhost:3000' },
          body: JSON.stringify({ email, password: 'x', accepted: ACCEPTED }),
        }),
      );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes('grant_type=password'))
          return Response.json({ access_token: 'a', refresh_token: 'r' });
        if (target === `${SUPABASE_ORIGIN}/auth/v1/user`) return Response.json(TEST_ACCOUNT);
        throw new Error(`Unexpected ${target}`);
      }),
    );
    expect((await attempt('owner@studio.test')).status).toBe(200);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    expect((await attempt('nobody@studio.test')).status).toBe(401);

    expect(sent).toEqual([
      // TASK-0055: a successful sign-in names its address, so the panel can tell accounts apart.
      {
        account: TEST_ACCOUNT.id,
        event: {
          kind: 'sign_in',
          operation: 'password',
          text: TEST_ACCOUNT.email,
          // TASK-0064: what was accepted is recorded with the sign-in.
          detail: ACCEPTED,
        },
      },
      {
        account: undefined,
        event: { kind: 'sign_in', operation: 'password', outcome: 'refused' },
      },
    ]);
    // The refused attempt names nobody: not the address tried, not an account.
    expect(JSON.stringify(sent)).not.toContain('nobody@studio.test');
  });

  it('delivers to the worker with the service token, and never fails a request', async () => {
    vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
    const posted: { url: string; headers: Headers; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        posted.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        throw new Error('worker down');
      }),
    );
    routeEvents(undefined); // the real transport

    const { report } = await import('../../lib/telemetry');
    report({ kind: 'sign_in', operation: 'password' }, TEST_ACCOUNT.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(posted).toHaveLength(1);
    expect(posted[0]!.url).toMatch(/\/studio\/events$/);
    expect(posted[0]!.headers.get('Authorization')).toBe('Bearer test-only-token');
    expect(posted[0]!.headers.get('X-Owner-Id')).toBe(TEST_ACCOUNT.id);
    expect(posted[0]!.body).toEqual({ events: [{ kind: 'sign_in', operation: 'password' }] });
  });
});
