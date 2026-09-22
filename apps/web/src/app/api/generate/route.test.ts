import { describe, expect, it, vi, afterEach } from 'vitest';
import { POST } from './route';
import { POST as consult } from '../consultation/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('generation boundary', () => {
  it('rejects client-authored dossier without server session', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          dossier: { masterDiffusionPrompt: 'forged' },
          slots: { subject: { description: 'forged' } },
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).stencil).toBeUndefined();
  });
  it('rejects malformed JSON', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/generate', { method: 'POST', body: '{' }),
    );
    expect(response.status).toBe(400);
  });
  it.each(['solo negro', 'con color', 'con toques de color'])(
    'queues %s using the server brief and actual references',
    async (colour) => {
      vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
      let submitted: Record<string, unknown> | undefined;
      const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes('commons.wikimedia.org/w/api'))
          return Response.json({
            query: {
              pages: {
                one: {
                  title: 'File:Lion.png',
                  imageinfo: [{ url: 'https://upload.wikimedia.org/lion.png', mime: 'image/png' }],
                },
              },
            },
          });
        if (target === 'https://upload.wikimedia.org/lion.png')
          return new Response(new Uint8Array([1, 2, 3]));
        if (target.endsWith('/studio/media')) {
          expect(JSON.parse(String(init?.body)).data).toBe('AQID');
          return Response.json({ assetId: 'a'.repeat(32), mimeType: 'image/png' });
        }
        if (target.endsWith('/studio/jobs')) {
          submitted = JSON.parse(String(init?.body));
          return Response.json({
            jobId: 'b'.repeat(32),
            state: 'queued',
            result: null,
            error: null,
          });
        }
        throw new Error('Unexpected request');
      });
      vi.stubGlobal('fetch', request);
      const started = await consult(
        new Request('http://localhost:3000/api/consultation', {
          method: 'POST',
          body: JSON.stringify({
            action: 'orchestrate',
            userMessage: `Un león de línea fina en el antebrazo izquierdo, ${colour}, 8 x 15 cm`,
          }),
        }),
      );
      expect(started.status).toBe(200);
      const cookie = started.headers.get('set-cookie')!.split(';')[0]!;
      const response = await POST(
        new Request('http://localhost:3000/api/generate', {
          method: 'POST',
          headers: { cookie },
          body: JSON.stringify({
            adult: true,
            consent: true,
            referencesReviewed: true,
            idempotencyKey: '11111111-1111-4111-8111-111111111111',
            brief: { subject: { description: 'forged' } },
          }),
        }),
      );
      expect(response.status).toBe(202);
      expect(submitted?.['brief']).toMatchObject({
        subject: { description: expect.stringContaining('Un león') },
        size: { widthMm: 80, heightMm: 150 },
      });
      expect(submitted?.['referenceIds']).toEqual(['a'.repeat(32)]);
      const edit = { parentJobId: 'b'.repeat(32), instruction: 'Haz el león más pequeño' };
      const edited = await POST(
        new Request('http://localhost:3000/api/generate', {
          method: 'POST',
          headers: { cookie },
          body: JSON.stringify({
            adult: true,
            consent: true,
            edit,
            idempotencyKey: '22222222-2222-4222-8222-222222222222',
            masterAssetId: 'forged',
            brief: { subject: 'forged' },
          }),
        }),
      );
      expect(edited.status).toBe(202);
      expect(submitted).toEqual({
        edit,
        referencesReviewed: true,
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      });
      const denied = await POST(
        new Request('http://localhost:3000/api/generate', {
          method: 'POST',
          headers: { cookie },
          body: JSON.stringify({ adult: false, consent: true, edit }),
        }),
      );
      expect(denied.status).toBe(422);
    },
  );
});
