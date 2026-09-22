import { describe, it, expect, vi } from 'vitest';
import { VisualSearchAgent, referenceQueries } from '../agents/image-scout';
import { OrchestratorAgent } from '../agents/orchestrator';
import { VisualCreatorAgent } from '../agents/creator';
const reference = {
  source: 'https://upload.wikimedia.org/example.png',
  mimeType: 'image/png' as const,
};
const offline = () =>
  new OrchestratorAgent(
    new VisualSearchAgent(
      vi.fn(async () => Response.json({ query: { pages: {} } })) as typeof fetch,
    ),
  );
describe('TASK-0019 consultation and references', () => {
  it('finds the Valencia crest on the official site without asking the user to upload', async () => {
    const request = vi.fn(
      async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    );
    const result = await new VisualSearchAgent(request as typeof fetch).scoutReferenceImages({
      userInput: 'Escudo Valencia CF',
    });
    expect(result.scoutedImages[0]).toMatchObject({
      source: 'https://www.valenciacf.com/svg/escudo.svg',
      referenceQuery: 'Valencia CF crest',
      sourcePage: 'https://www.valenciacf.com/es/club/escudos',
      verification: 'candidate',
    });
    expect(request).toHaveBeenCalledOnce();
  });
  it('tries alternatives when the official crest is unavailable and rejects unrelated files', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('valenciacf.com')) return new Response('', { status: 503 });
      return Response.json({
        query: {
          pages: {
            unrelated: {
              index: 1,
              title: 'File:Valencia team shirt.png',
              imageinfo: [{ url: reference.source, mime: 'image/png' }],
            },
            crest: {
              index: 2,
              title: 'File:Valencia CF logo.png',
              imageinfo: [{ url: 'https://upload.wikimedia.org/crest.png', mime: 'image/png' }],
            },
          },
        },
      });
    });
    const result = await new VisualSearchAgent(request as typeof fetch).scoutReferenceImages({
      userInput: 'Valencia CF',
    });
    expect(result.scoutedImages[0]?.source).toBe('https://upload.wikimedia.org/crest.png');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('retries only missing references and preserves the original brief and references', async () => {
    const request = vi.fn(
      async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    );
    const o = new OrchestratorAgent(new VisualSearchAgent(request as typeof fetch));
    const initial = o.createSession();
    initial.slots = { subject: { description: 'Senyera Valenciana y Valencia CF' } };
    initial.references = [{ ...reference, referenceQuery: referenceQueries('Senyera')[0]! }];
    const result = await o.handleUserInteraction(initial, '', [], undefined, true);
    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toEqual(initial.references[0]);
    expect(result.slots.subject).toEqual(initial.slots.subject);
    expect(result.questionsAsked).toBe(0);
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(['con color', 'con toques de color'])(
    'prepares %s without asking for a technical palette',
    async (colour) => {
      const o = offline();
      const s = await o.handleUserInteraction(
        o.createSession(),
        `Un león de línea fina en el antebrazo izquierdo, ${colour}, 8 x 15 cm`,
        [reference],
      );
      expect(s.questionsAsked).toBe(0);
      expect(s.missingFields).toEqual([]);
      expect(s.brief?.colour.palette).toBeUndefined();
      expect(s.phase).toBe('ready_to_generate');
    },
  );
  it('preserves a lion and explicit preferences across three questions', async () => {
    const o = offline();
    let s = o.createSession();
    for (const text of ['Un león', 'En el antebrazo izquierdo', 'Línea fina', 'Solo negro'])
      s = await o.handleUserInteraction(s, text, [reference]);
    expect(s.slots.subject?.description).toBe('Un león');
    expect(s.slots.placement?.side).toBe('left');
    expect(s.slots.style?.primary).toBe('fine_line');
    expect(s.slots.linework?.weight).toBe('fine');
    expect(s.slots.colour).toEqual({ mode: 'black_and_grey' });
    expect(s.questionsAsked).toBe(3);
    expect(s.phase).toBe('needs_details');
    expect(s.brief).toBeUndefined();
  });
  it('asks zero questions for a fully specified brief and validates it', async () => {
    const o = offline();
    const s = await o.handleUserInteraction(
      o.createSession(),
      'Un león de línea fina en el antebrazo izquierdo, solo negro, 8 x 15 cm',
      [reference],
    );
    expect(s.questionsAsked).toBe(0);
    expect(s.brief?.size).toEqual({ widthMm: 80, heightMm: 150 });
    expect(s.phase).toBe('ready_to_generate');
  });
  it('does not infer placement from two motifs, nor generate after three missing answers', async () => {
    const o = offline();
    let s = o.createSession();
    for (let i = 0; i < 5; i++)
      s = await o.handleUserInteraction(s, i === 0 ? 'Mare de Déu y Senyera' : 'No lo sé', [
        reference,
      ]);
    expect(s.questionsAsked).toBe(3);
    expect(s.slots.placement?.bodyPart).toBeUndefined();
    expect(s.brief).toBeUndefined();
    expect(s.phase).toBe('needs_details');
  });
  it('uses the actual search response and records provenance', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('Real');
      return Response.json({
        query: {
          pages: {
            one: {
              title: 'File:Real Madrid.png',
              imageinfo: [
                {
                  url: reference.source,
                  mime: 'image/png',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Real_Madrid.png',
                  extmetadata: { LicenseShortName: { value: 'CC BY' } },
                },
              ],
            },
          },
        },
      });
    });
    const scout = new VisualSearchAgent(request as typeof fetch);
    const result = await scout.scoutReferenceImages({ userInput: 'Escudo del Real Madrid' });
    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toContain('Real');
    expect(result.scoutedImages[0]?.verification).toBe('candidate');
    expect(result.scoutedImages[0]?.license).toBe('CC BY');
    expect(referenceQueries('Escudo del Real Madrid')).toEqual(['Escudo del Real Madrid']);
  });
  it('does not fetch when user supplied references', async () => {
    const request = vi.fn();
    await new VisualSearchAgent(request as typeof fetch).scoutReferenceImages({
      userInput: 'Escudo',
      userUploadedImages: [reference],
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('accepts current Wikimedia thumbnails but blocks a missing requested symbol', async () => {
    const scout = new VisualSearchAgent(
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('Flag')) return Response.json({ query: { pages: {} } });
        return Response.json({
          query: {
            pages: {
              one: {
                index: 1,
                title: 'File:Statue.jpg',
                imageinfo: [
                  {
                    thumburl: 'https://thumb.wikimedia.org/statue.jpg?utm_source=commons',
                    mime: 'image/jpeg',
                  },
                ],
              },
            },
          },
        });
      }) as typeof fetch,
    );
    const orchestrator = new OrchestratorAgent(scout);
    const session = await orchestrator.handleUserInteraction(
      orchestrator.createSession(),
      'Mare de Déu dels Desamparats y Senyera Valenciana, línea fina en el gemelo derecho, solo negro, 8 x 15 cm',
    );
    expect(session.questionsAsked).toBe(0);
    expect(session.references[0]?.source).toBe('https://thumb.wikimedia.org/statue.jpg');
    expect(session.phase).toBe('needs_details');
    expect(session.missingFields.some((field) => field.includes('Flag'))).toBe(true);
  });
  it('has no successful fallback for the retired creator', async () => {
    await expect(new VisualCreatorAgent().generateTattoo()).rejects.toThrow('worker');
  });
});
