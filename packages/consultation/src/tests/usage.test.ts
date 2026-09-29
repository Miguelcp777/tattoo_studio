import { afterEach, describe, expect, it } from 'vitest';

import { ClaudeConsultationProvider, ClaudeError } from '../index';
import { metered, onProviderUsage, tokensOf, type ProviderUsage } from '../usage';

afterEach(() => onProviderUsage(undefined));

function listen(): ProviderUsage[] {
  const heard: ProviderUsage[] = [];
  onProviderUsage((usage) => heard.push(usage));
  return heard;
}

const claudeAnswering = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

describe('model calls are reported (TASK-0054)', () => {
  it('reports a Claude consultation turn with its tokens', async () => {
    const heard = listen();
    const provider = new ClaudeConsultationProvider(
      { apiKey: 'k' },
      claudeAnswering(200, {
        id: 'msg',
        type: 'message',
        role: 'assistant',
        model: 'claude-test',
        content: [{ type: 'text', text: JSON.stringify({ assistantReply: 'Hola' }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 90 },
      }),
    );

    await provider.processTurn(
      [{ role: 'user', content: 'Un lobo', timestamp: new Date().toISOString() }],
      {},
    );

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      provider: 'anthropic',
      operation: 'consultation',
      outcome: 'ok',
      inputTokens: 1200,
      outputTokens: 90,
    });
    expect(heard[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a failed call as one, and the consultation still fails as before', async () => {
    const heard = listen();
    const provider = new ClaudeConsultationProvider(
      { apiKey: 'k', maxRetries: 0 } as ConstructorParameters<typeof ClaudeConsultationProvider>[0],
      claudeAnswering(500, { type: 'error', error: { type: 'api_error', message: 'boom' } }),
    );
    await expect(
      provider.processTurn([{ role: 'user', content: 'x', timestamp: '' }], {}),
    ).rejects.toThrow(ClaudeError);
    expect(heard.map((usage) => usage.outcome)).toContain('error');
    // Only the error's name travels: a message can quote the request.
    expect(heard.every((usage) => !usage.error || !usage.error.includes('boom'))).toBe(true);
  });

  it('a listener that throws never breaks the call', async () => {
    onProviderUsage(() => {
      throw new Error('monitoring down');
    });
    await expect(
      metered({ provider: 'openai', operation: 'consultation', model: 'm' }, async () => 42),
    ).resolves.toBe(42);
  });

  it('reads tokens from both providers, and nothing from a body without usage', () => {
    expect(tokensOf({ usage: { input_tokens: 3, output_tokens: 4 } })).toEqual({
      inputTokens: 3,
      outputTokens: 4,
    });
    expect(tokensOf({ usage: { prompt_tokens: 5, completion_tokens: 6 } })).toEqual({
      inputTokens: 5,
      outputTokens: 6,
    });
    expect(tokensOf({})).toEqual({});
    expect(tokensOf(null)).toEqual({});
  });
});
