import { afterEach, describe, expect, it, vi } from 'vitest';

import { BraveImageSearch, isBraveThumbnail, onProviderUsage, VisualSearchAgent } from '../index';
import type { ProviderUsage } from '../usage';

const THUMB = 'https://imgs.search.brave.com/abc123/rs:fit:500:0:0:0/g:ce/aHR0cHM6Ly9leC5wbmc';

afterEach(() => onProviderUsage(undefined));

describe('Brave image search (TASK-0068, ADR-0030)', () => {
  it('asks with the key and safe search, and keeps only Brave thumbnails', async () => {
    const asked: { url: string; headers: Headers }[] = [];
    const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      asked.push({ url: String(url), headers: new Headers(init?.headers) });
      return Response.json({
        results: [
          {
            title: 'Elsewhere',
            url: 'https://ex.test/a',
            thumbnail: { src: 'https://ex.test/x.jpg' },
          },
          { title: '<b>Ramones</b> logo', url: 'https://ex.test/b', thumbnail: { src: THUMB } },
          { title: 'Query', url: 'https://ex.test/c', thumbnail: { src: `${THUMB}?w=1` } },
        ],
      });
    }) as unknown as typeof fetch;
    const usage: ProviderUsage[] = [];
    onProviderUsage((u) => usage.push(u));

    const found = await new BraveImageSearch('test-key', request).search('Ramones logo');

    const url = new URL(asked[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://api.search.brave.com/res/v1/images/search',
    );
    expect(url.searchParams.get('q')).toBe('Ramones logo');
    expect(url.searchParams.get('safesearch')).toBe('strict');
    expect(asked[0]!.headers.get('X-Subscription-Token')).toBe('test-key');
    expect(found).toEqual([
      expect.objectContaining({
        source: THUMB,
        label: 'Ramones logo',
        sourcePage: 'https://ex.test/b',
        license: 'Imagen de la web · derechos de su autor',
        referenceQuery: 'Ramones logo',
        verification: 'candidate',
      }),
    ]);
    expect(usage).toEqual([
      expect.objectContaining({ provider: 'brave', operation: 'web_image_search', outcome: 'ok' }),
    ]);
  });

  it('reports a refusal as an error and throws', async () => {
    const usage: ProviderUsage[] = [];
    onProviderUsage((u) => usage.push(u));
    const request = vi.fn(
      async () => new Response('{}', { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(new BraveImageSearch('k', request).search('x')).rejects.toThrow('429');
    expect(usage[0]?.outcome).toBe('error');
  });

  it('recognises only a Brave-proxied thumbnail', () => {
    expect(isBraveThumbnail(THUMB)).toBe(true);
    for (const bad of [
      `${THUMB}?x=1`,
      THUMB.replace('https:', 'http:'),
      'https://imgs.search.brave.com.evil.test/abc',
      'https://imgs.search.brave.com/',
      'not a url',
    ])
      expect(isBraveThumbnail(bad), bad).toBe(false);
  });
});

describe('when the scout searches the web (TASK-0068)', () => {
  const emptySources = vi.fn(async (url: string | URL | Request) =>
    String(url).includes('openverse')
      ? Response.json({ results: [] })
      : String(url).startsWith('https://imgs.search.brave.com/')
        ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
        : Response.json({ query: { pages: {} } }),
  ) as unknown as typeof fetch;
  const webHit = (query: string) => [
    {
      source: THUMB,
      referenceQuery: query,
      mimeType: 'image/jpeg' as const,
      label: 'Ramones seal',
      verification: 'candidate' as const,
    },
  ];

  it('only for an essential reference the licensed sources lacked, and judged', async () => {
    const search = vi.fn(async (query: string) => webHit(query));
    const choose = vi.fn(async () => [0]);
    const result = await new VisualSearchAgent(emptySources, {
      planner: {
        plan: async () => [
          { query: 'Ramones logo', essential: true, label: 'el logo de los Ramones' },
          { query: 'eagle', essential: false },
        ],
      },
      judge: { choose },
      openWeb: { search },
    }).scoutReferenceImages({ userInput: 'El logo de los Ramones con un águila' });

    // The generic "eagle" never reaches the web; the essential logo does, and the judge sees it.
    expect(search.mock.calls.map(([query]) => query)).toEqual(['Ramones logo']);
    expect(choose).toHaveBeenCalledOnce();
    expect(result.scoutedImages.map((image) => image.source)).toEqual([THUMB]);
  });

  it('keeps nothing from the web that the judge refuses', async () => {
    const result = await new VisualSearchAgent(emptySources, {
      planner: { plan: async () => [{ query: 'Ramones logo', essential: true }] },
      judge: { choose: async () => [] },
      openWeb: { search: async (query: string) => webHit(query) },
    }).scoutReferenceImages({ userInput: 'El logo de los Ramones' });
    expect(result.scoutedImages).toEqual([]);
  });
});
