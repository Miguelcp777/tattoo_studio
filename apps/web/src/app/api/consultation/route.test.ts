import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
afterEach(() => vi.unstubAllGlobals());
const req = (body: unknown, cookie = '') =>
  new Request('http://localhost:3000/api/consultation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
describe('consultation server ownership', () => {
  it('ignores forged state and counts questions on the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ query: { pages: {} } })),
    );
    const first = await POST(
      req({
        action: 'start',
        idea: 'Un león',
        orchestrationSession: { questionsAsked: 0, slots: { placement: { bodyPart: 'calf' } } },
      }),
    );
    expect(first.status).toBe(200);
    const cookie = first.headers.get('set-cookie')!.split(';')[0]!;
    const initial = await first.json();
    expect(initial.session.slots.placement.bodyPart).toBeUndefined();
    const second = await POST(
      req({ action: 'advance', userMessage: 'Antebrazo izquierdo' }, cookie),
    );
    const data = await second.json();
    expect(data.session.questionsAsked).toBe(2);
    expect(data.session.slots.subject.description).toBe('Un león');
  });
  it('rejects invalid actions, malformed JSON and invalid preferences', async () => {
    expect((await POST(req({ idea: 'hello' }))).status).toBe(400);
    expect(
      (
        await POST(
          req({ action: 'preferences', preferences: { size: { widthMm: -1, heightMm: 0 } } }),
        )
      ).status,
    ).toBe(400);
  });
  it('rejects cross-origin submissions', async () => {
    const r = req({ action: 'start', idea: 'hello' });
    r.headers.set('origin', 'https://attacker.example');
    expect((await POST(r)).status).toBe(403);
  });
  it.each([undefined, []])(
    'saves optional accent colours (%j) with valid dimensions',
    async (palette) => {
      const response = await POST(
        req({
          action: 'preferences',
          preferences: {
            size: { widthMm: 200, heightMm: 300 },
            colour: { mode: 'black_and_grey_with_accent', palette },
          },
        }),
      );
      expect(response.status).toBe(200);
      const { session } = await response.json();
      expect(session.slots.colour).toEqual({ mode: 'black_and_grey_with_accent' });
      expect(session.slots.size).toEqual({ widthMm: 200, heightMm: 300 });
      expect(session.missingFields).not.toContain('paleta');
      expect(session.questionsAsked).toBe(0);
    },
  );
  it('saves 200 x 300 mm with a valid accent palette', async () => {
    const response = await POST(
      req({
        action: 'preferences',
        preferences: {
          size: { widthMm: 200, heightMm: 300 },
          colour: { mode: 'black_and_grey_with_accent', palette: ['rojo', 'azul'] },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).session.slots.size).toEqual({ widthMm: 200, heightMm: 300 });
  });
  it('reports dimension errors when dimensions actually fail', async () => {
    const response = await POST(
      req({ action: 'preferences', preferences: { size: { widthMm: 601, heightMm: 300 } } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('entre 5 y 600 mm');
  });
});
