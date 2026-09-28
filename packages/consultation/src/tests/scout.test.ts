import { describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_SCOUT_MODEL,
  ClaudeScoutQueryPlanner,
  referenceQueries,
  VisualSearchAgent,
  type CandidateScreen,
  type OpenWebImageSearch,
} from '../index';
import type { ReferenceImage } from '../types';

/** Commons returns nothing, so every query falls through to the open-web fallback. */
const emptyCommons = vi.fn(async () =>
  Response.json({ query: { pages: {} } }),
) as unknown as typeof fetch;

/** Commons returns one licensed file for any query. */
const commonsHit = vi.fn(async () =>
  Response.json({
    query: {
      pages: {
        one: {
          index: 1,
          title: 'File:Fox.png',
          imageinfo: [{ url: 'https://upload.wikimedia.org/fox.png', mime: 'image/png' }],
        },
      },
    },
  }),
) as unknown as typeof fetch;

const webCandidate = (source: string, label: string): ReferenceImage => ({
  source,
  mimeType: 'image/jpeg',
  label,
  referenceQuery: 'q',
  verification: 'candidate',
});

describe('Visual scout on Claude Sonnet (TASK-0032/REQ-005)', () => {
  it('uses the injected planner to decide the queries', async () => {
    const plan = vi.fn(async () => [{ query: 'red fox illustration', essential: false }]);
    const request = vi.fn(async (url: string | URL | Request) => {
      expect(decodeURIComponent(String(url))).toContain('red fox illustration');
      return Response.json({ query: { pages: {} } });
    }) as unknown as typeof fetch;

    await new VisualSearchAgent(request, { planner: { plan } }).scoutReferenceImages({
      userInput: 'un zorro',
    });

    expect(plan).toHaveBeenCalledWith('un zorro');
    expect(request).toHaveBeenCalledOnce();
  });

  it('falls back to the deterministic queries when the planner fails', async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      expect(decodeURIComponent(String(url))).toContain('Escudo del Real Madrid');
      return Response.json({ query: { pages: {} } });
    }) as unknown as typeof fetch;
    const planner = {
      plan: vi.fn(async () => {
        throw new Error('down');
      }),
    };

    await new VisualSearchAgent(request, { planner }).scoutReferenceImages({
      userInput: 'Escudo del Real Madrid',
    });

    expect(referenceQueries('Escudo del Real Madrid')).toEqual(['Escudo del Real Madrid']);
    expect(request).toHaveBeenCalledOnce();
  });

  it('prefers licensed sources and never consults the open web when Commons answers', async () => {
    const openWeb: OpenWebImageSearch = { search: vi.fn(async () => []) };
    const result = await new VisualSearchAgent(commonsHit, { openWeb }).scoutReferenceImages({
      userInput: 'fox',
    });
    expect(result.scoutedImages[0]?.source).toBe('https://upload.wikimedia.org/fox.png');
    expect(openWeb.search).not.toHaveBeenCalled();
  });

  it('uses the open web only as a fallback when licensed sources return nothing', async () => {
    const openWeb: OpenWebImageSearch = {
      search: vi.fn(async () => [webCandidate('https://example.org/fox.jpg', 'fox drawing')]),
    };
    const result = await new VisualSearchAgent(emptyCommons, { openWeb }).scoutReferenceImages({
      userInput: 'fox',
    });
    expect(openWeb.search).toHaveBeenCalledOnce();
    expect(result.scoutedImages[0]?.source).toBe('https://example.org/fox.jpg');
    expect(result.scoutedImages[0]?.verification).toBe('candidate');
  });

  it('rejects an open-web candidate depicting a real person (AC-004)', async () => {
    const person = webCandidate('https://example.org/person.jpg', 'photo of a real person');
    const drawing = webCandidate('https://example.org/fox.jpg', 'fox drawing');
    const openWeb: OpenWebImageSearch = { search: vi.fn(async () => [person, drawing]) };
    const screen: CandidateScreen = {
      screen: vi.fn(async (image: ReferenceImage) => !image.label?.includes('real person')),
    };

    const result = await new VisualSearchAgent(emptyCommons, {
      openWeb,
      screen,
    }).scoutReferenceImages({ userInput: 'fox' });

    expect(result.scoutedImages.map((r) => r.source)).toEqual(['https://example.org/fox.jpg']);
    expect(screen.screen).toHaveBeenCalledWith(person);
  });

  it('screens licensed candidates too, and fails closed when the screen errors', async () => {
    const screen: CandidateScreen = {
      screen: vi.fn(async () => {
        throw new Error('moderation unavailable');
      }),
    };
    const result = await new VisualSearchAgent(commonsHit, { screen }).scoutReferenceImages({
      userInput: 'fox',
    });
    expect(result.scoutedImages).toEqual([]);
  });
});

describe('ClaudeScoutQueryPlanner (TASK-0032/REQ-005)', () => {
  it('asks Sonnet 5 for schema-constrained queries and keeps at most three', async () => {
    let body: Record<string, unknown> = {};
    const request = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              queries: [
                { query: ' red fox ', essential: false, label: 'un zorro rojo' },
                { query: 'fox head', essential: false, label: 'cabeza de zorro' },
                { query: 'FC Barcelona crest', essential: true, label: 'el escudo del Barça' },
                { query: 'extra', essential: false, label: 'extra' },
              ],
            }),
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 5 },
      });
    }) as unknown as typeof fetch;

    const queries = await new ClaudeScoutQueryPlanner({ apiKey: 'k' }, request).plan('un zorro');

    expect(body['model']).toBe(CLAUDE_SCOUT_MODEL);
    expect(body['model']).toBe('claude-sonnet-5');
    expect((body['output_config'] as { effort: string }).effort).toBe('low');
    expect(queries).toEqual([
      { query: 'red fox', essential: false, label: 'un zorro rojo' },
      { query: 'fox head', essential: false, label: 'cabeza de zorro' },
      { query: 'FC Barcelona crest', essential: true, label: 'el escudo del Barça' },
    ]);
  });

  it('throws without a credential so the scout falls back', async () => {
    await expect(new ClaudeScoutQueryPlanner({ apiKey: '' }).plan('x')).rejects.toThrow();
  });
});
