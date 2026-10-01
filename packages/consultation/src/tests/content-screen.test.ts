import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONSULTATION_OUTPUT_SCHEMA,
  CONSULTATION_SYSTEM_PROMPT,
  CONTENT_REFUSED_MESSAGE,
  ContentRefusedError,
  OpenAITextModeration,
  OrchestratorAgent,
  refusedByModeration,
  SEXUAL_SCORE_LIMIT,
  VisualSearchAgent,
  type ConsultationProvider,
  type ProviderExtractionOutput,
  type TextScreen,
} from '../index';

const offlineScout = () => {
  const request = vi.fn(async () => Response.json({ query: { pages: {} } }));
  return { scout: new VisualSearchAgent(request as typeof fetch), request };
};

function architectSaying(output: Partial<ProviderExtractionOutput>) {
  const processTurn = vi.fn(async () => ({ extractedSlots: {}, assistantReply: 'ok', ...output }));
  const architect: ConsultationProvider = { processTurn };
  return { architect, processTurn };
}

const screenSaying = (refuse: boolean): TextScreen & { refuses: ReturnType<typeof vi.fn> } => ({
  refuses: vi.fn(async () => refuse),
});

afterEach(() => vi.restoreAllMocks());

describe('refusedByModeration (TASK-0070)', () => {
  it('refuses a clearly explicit score and anything sexual about minors', () => {
    expect(refusedByModeration({ category_scores: { sexual: 0.92 } })).toBe(true);
    expect(refusedByModeration({ category_scores: { sexual: SEXUAL_SCORE_LIMIT } })).toBe(true);
    expect(
      refusedByModeration({
        categories: { 'sexual/minors': true },
        category_scores: { sexual: 0 },
      }),
    ).toBe(true);
  });

  it('lets suggestive motifs through, to be judged by the architect', () => {
    // A winking pin-up scored 0.60 and was flagged by OpenAI's own threshold (2026-10-01).
    expect(
      refusedByModeration({ categories: { sexual: true }, category_scores: { sexual: 0.6 } }),
    ).toBe(false);
    expect(refusedByModeration({ category_scores: { sexual: 0.1, violence: 0.9 } })).toBe(false);
    expect(refusedByModeration(undefined)).toBe(false);
  });
});

describe('OpenAITextModeration (TASK-0070)', () => {
  it('asks the moderation endpoint with the text in the body', async () => {
    const request = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({ results: [{ categories: {}, category_scores: { sexual: 0.9 } }] }),
    );
    const screen = new OpenAITextModeration('key', request as unknown as typeof fetch);
    expect(await screen.refuses('una pareja teniendo sexo')).toBe(true);
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/moderations');
    expect(String(url)).not.toContain('pareja');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'omni-moderation-latest',
      input: 'una pareja teniendo sexo',
    });
  });

  it('lets the idea through when the moderation fails, and asks nothing for empty text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = vi.fn(async () => new Response('{}', { status: 500 }));
    expect(
      await new OpenAITextModeration('key', failing as unknown as typeof fetch).refuses('x'),
    ).toBe(false);
    const thrown = vi.fn(async () => {
      throw new Error('network');
    });
    expect(
      await new OpenAITextModeration('key', thrown as unknown as typeof fetch).refuses('x'),
    ).toBe(false);
    const unused = vi.fn();
    expect(
      await new OpenAITextModeration('key', unused as unknown as typeof fetch).refuses('  '),
    ).toBe(false);
    expect(unused).not.toHaveBeenCalled();
  });

  it('needs a key', () => {
    expect(() => new OpenAITextModeration('')).toThrow();
  });
});

describe('an explicit idea is refused before anything runs (TASK-0070)', () => {
  it('the screen refuses: no architect, no search, the session untouched', async () => {
    const { scout, request } = offlineScout();
    const { architect, processTurn } = architectSaying({});
    const screen = screenSaying(true);
    const o = new OrchestratorAgent(scout, architect, screen);
    const session = o.createSession();
    const before = structuredClone(session);
    await expect(o.handleUserInteraction(session, 'una idea explícita')).rejects.toThrow(
      ContentRefusedError,
    );
    expect(screen.refuses).toHaveBeenCalledWith('una idea explícita');
    expect(processTurn).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(session).toEqual(before);
  });

  it('the architect refuses what the moderation let through', async () => {
    const { scout } = offlineScout();
    const { architect } = architectSaying({
      contentRefused: { explanation: 'Contenido sexual explícito.' },
    });
    const o = new OrchestratorAgent(scout, architect, screenSaying(false));
    await expect(
      o.handleUserInteraction(o.createSession(), 'un pene rodeado de rosas'),
    ).rejects.toThrow(CONTENT_REFUSED_MESSAGE);
  });

  it('an ordinary idea goes on, and a panel save without text is not screened', async () => {
    const { scout } = offlineScout();
    const screen = screenSaying(false);
    const o = new OrchestratorAgent(
      scout,
      architectSaying({ contentRefused: undefined }).architect,
      screen,
    );
    const next = await o.handleUserInteraction(o.createSession(), 'una pin-up guiñando un ojo');
    expect(next.slots.subject?.description).toContain('pin-up');
    await o.handleUserInteraction(next, '', [], { style: { primary: 'american_traditional' } });
    expect(screen.refuses).toHaveBeenCalledTimes(1);
  });
});

describe('the architect is asked to judge it (TASK-0070)', () => {
  it('the output schema requires a nullable contentRefused and the prompt explains it', () => {
    expect(CONSULTATION_OUTPUT_SCHEMA.required).toContain('contentRefused');
    expect(CONSULTATION_SYSTEM_PROMPT).toContain('"contentRefused"');
    expect(CONSULTATION_SYSTEM_PROMPT).toMatch(/pin-ups/);
  });
});
