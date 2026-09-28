import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { POST as consult } from '../consultation/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('media upload for a change request (TASK-0036)', () => {
  it('forwards only the image and consent, and leaves the consultation untouched', async () => {
    vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
    const uploads: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes('commons.wikimedia.org/w/api')) return Response.json({ query: {} });
        if (target.endsWith('/studio/media')) {
          uploads.push(JSON.parse(String(init?.body)));
          return Response.json({ assetId: 'c'.repeat(32), mimeType: 'image/png' });
        }
        throw new Error(`Unexpected request ${target}`);
      }),
    );
    const started = await consult(
      new Request('http://localhost:3000/api/consultation', {
        method: 'POST',
        body: JSON.stringify({
          action: 'orchestrate',
          userMessage: 'Una virgen de realismo en el gemelo derecho',
        }),
      }),
    );
    const cookie = started.headers.get('set-cookie')!.split(';')[0]!;
    const before = (await started.json()).session;
    const response = await POST(
      new Request('http://localhost:3000/api/media', {
        method: 'POST',
        headers: { cookie },
        body: JSON.stringify({
          data: 'AQID',
          kind: 'reference',
          purpose: 'edit',
          adult: true,
          consent: true,
          label: 'forged',
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assetId).toBe('c'.repeat(32));
    expect(uploads).toEqual([{ data: 'AQID', kind: 'reference', adult: true, consent: true }]);
    // The accepted brief is not reopened: no reference joins the consultation session.
    expect(body.session).toBeUndefined();
    expect(before.references.some((r: { assetId?: string }) => r.assetId === 'c'.repeat(32))).toBe(
      false,
    );
  });
});
