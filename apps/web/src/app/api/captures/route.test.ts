import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { answerAuth, configureAuth, signedIn, TEST_ACCOUNT } from '../../../lib/auth.testing';
import { CaptureRefused, saveCapture } from '../../../lib/capture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  configureAuth();
  vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
});

const PARENT = 'b'.repeat(32);
const KEY = '66666666-6666-4666-8666-666666666666';
// A real, contract-valid kept version: the route validates what the worker returns.
const kept = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../../contracts/fixtures/studio-status/valid/camera-capture.json',
    ),
    'utf8',
  ),
) as { jobId: string };

interface Sent {
  url: string;
  owner: string | null;
  body: Record<string, unknown>;
}

function workerSpy(sent: Sent[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const authenticated = answerAuth(target, init);
    if (authenticated) return authenticated;
    sent.push({
      url: target,
      owner: new Headers(init?.headers).get('X-Owner-Id'),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json(kept, { status: 201 });
  });
}

const keep = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost:3000/api/captures', {
      method: 'POST',
      headers: { cookie: signedIn(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const complete = {
  parentJobId: PARENT,
  idempotencyKey: KEY,
  adult: true,
  consent: true,
  data: 'AQID',
};

describe('keeping a camera photo (TASK-0050)', () => {
  it('forwards exactly what the worker needs, as the account', async () => {
    const sent: Sent[] = [];
    vi.stubGlobal('fetch', workerSpy(sent));

    const response = await keep({ ...complete, brief: { forged: true }, bodyPhotoId: 'x' });

    expect(response.status).toBe(201);
    expect((await response.json()).jobId).toBe(kept.jobId);
    expect(sent).toEqual([
      {
        url: expect.stringMatching(/\/studio\/captures$/),
        owner: TEST_ACCOUNT.id,
        // Nothing else the client sent travels on.
        body: complete,
      },
    ]);
  });

  it.each([
    ['without age confirmation', { adult: false }],
    ['without consent', { consent: undefined }],
    ['without a design to belong to', { parentJobId: 'not-a-job' }],
    ['without a request key', { idempotencyKey: '' }],
    ['without a photo', { data: '' }],
  ])('is refused %s, before reaching the worker', async (_case, change) => {
    const sent: Sent[] = [];
    vi.stubGlobal('fetch', workerSpy(sent));
    const response = await keep({ ...complete, ...change });
    expect(response.status).toBe(422);
    expect(sent).toEqual([]);
  });
});

describe('the page side of keeping a photo (ADR-0022)', () => {
  const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

  it('refuses before any request unless age and consent are both confirmed', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    for (const [adult, consent] of [
      [false, true],
      [true, false],
      [false, false],
    ] as const)
      await expect(
        saveCapture({ blob: photo, parentJobId: PARENT, adult, consent, idempotencyKey: KEY }),
      ).rejects.toBeInstanceOf(CaptureRefused);
    expect(request).not.toHaveBeenCalled();
  });

  it('sends the one picture to the capture route and nowhere else', async () => {
    const targets: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        targets.push(String(url));
        expect(JSON.parse(String(init?.body))).toEqual({
          parentJobId: PARENT,
          idempotencyKey: KEY,
          adult: true,
          consent: true,
          data: 'AQID',
        });
        return Response.json(kept, { status: 201 });
      }),
    );
    const result = await saveCapture({
      blob: photo,
      parentJobId: PARENT,
      adult: true,
      consent: true,
      idempotencyKey: KEY,
    });
    expect(result.jobId).toBe(kept.jobId);
    expect(targets).toEqual(['/api/captures']);
  });

  it('reports the studio refusal in its own words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'La imagen no ha superado la revisión.' }, { status: 422 }),
      ),
    );
    await expect(
      saveCapture({
        blob: photo,
        parentJobId: PARENT,
        adult: true,
        consent: true,
        idempotencyKey: KEY,
      }),
    ).rejects.toThrow('La imagen no ha superado la revisión.');
  });
});
