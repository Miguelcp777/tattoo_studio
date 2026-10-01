import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrchestratorAgent } from '@tattoo/consultation';

import { ContentRefusedError, OpenAITextModeration } from '@tattoo/consultation';

import {
  buildOrchestrator,
  buildTextScreen,
  errorResponse,
  liveAgentConfig,
} from './studio-server';

describe('live consultation agents are opt-in (TASK-0033/AC-007)', () => {
  it('enables nothing by default', () => {
    expect(liveAgentConfig({})).toEqual({ architect: undefined, scoutPlanner: false });
  });

  it('a credential alone enables nothing', () => {
    expect(liveAgentConfig({ ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k' })).toEqual({
      architect: undefined,
      scoutPlanner: false,
    });
  });

  it('enables the Claude architect and the Sonnet scout only when configured', () => {
    expect(
      liveAgentConfig({ TATTOO_CONSULTATION_BACKEND: 'claude', TATTOO_SCOUT_PLANNER: 'claude' }),
    ).toEqual({ architect: 'claude', scoutPlanner: true });
    expect(liveAgentConfig({ TATTOO_CONSULTATION_BACKEND: 'openai' }).architect).toBe('openai');
  });

  it('never uses the canned fixture on the live route', () => {
    expect(liveAgentConfig({ TATTOO_CONSULTATION_BACKEND: 'fixture' }).architect).toBeUndefined();
  });

  it('builds an orchestrator for any configuration without network access', () => {
    for (const env of [
      {},
      { TATTOO_CONSULTATION_BACKEND: 'claude', TATTOO_SCOUT_PLANNER: 'claude' },
      { TATTOO_CONSULTATION_BACKEND: 'openai' },
    ])
      expect(buildOrchestrator(env)).toBeInstanceOf(OrchestratorAgent);
  });
});

describe('web image search is opted into, never implied by a key (TASK-0068)', () => {
  it('needs the Claude judge, the switch and the key', () => {
    const all = {
      TATTOO_SCOUT_PLANNER: 'claude',
      TATTOO_WEB_IMAGE_SEARCH: 'brave',
      BRAVE_SEARCH_API_KEY: 'k',
    };
    expect(liveAgentConfig(all).webImageSearch).toBe('brave');
    expect(liveAgentConfig({ ...all, BRAVE_SEARCH_API_KEY: '' }).webImageSearch).toBeUndefined();
    expect(liveAgentConfig({ ...all, TATTOO_WEB_IMAGE_SEARCH: '' }).webImageSearch).toBeUndefined();
    // Without the judge, web results would go unchecked: not enabled.
    expect(liveAgentConfig({ ...all, TATTOO_SCOUT_PLANNER: '' }).webImageSearch).toBeUndefined();
    expect(liveAgentConfig({ BRAVE_SEARCH_API_KEY: 'k' }).webImageSearch).toBeUndefined();
  });
});

describe('the text moderation (TASK-0070)', () => {
  it('runs with a live architect and the OpenAI key, never from the key alone', () => {
    const live = { TATTOO_CONSULTATION_BACKEND: 'claude', OPENAI_API_KEY: 'k' };
    expect(liveAgentConfig(live).textModeration).toBe('openai');
    expect(buildTextScreen(live)).toBeInstanceOf(OpenAITextModeration);
    expect(liveAgentConfig({ OPENAI_API_KEY: 'k' }).textModeration).toBeUndefined();
    expect(buildTextScreen({ OPENAI_API_KEY: 'k' })).toBeUndefined();
    expect(
      liveAgentConfig({ TATTOO_CONSULTATION_BACKEND: 'claude' }).textModeration,
    ).toBeUndefined();
  });

  it('a refused idea answers 422 with the studio message', async () => {
    const response = errorResponse(new ContentRefusedError());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('contenido sexual explícito');
  });

  it('screenText refuses through the configured moderation', async () => {
    vi.stubEnv('TATTOO_CONSULTATION_BACKEND', 'claude');
    vi.stubEnv('OPENAI_API_KEY', 'test-not-a-secret');
    vi.resetModules();
    const fetch = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe('https://api.openai.com/v1/moderations');
      return Response.json({ results: [{ categories: {}, category_scores: { sexual: 0.95 } }] });
    });
    vi.stubGlobal('fetch', fetch);
    const server = await import('./studio-server');
    await expect(server.screenText('un texto explícito')).rejects.toThrow('sexual explícito');
    await expect(server.screenText('  ')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('paid consultation turns are counted first (TASK-0078, audit SEG-02)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('asks the worker to count a turn when the consultation uses paid models', async () => {
    vi.stubEnv('TATTOO_WORKER_TOKEN', 'test-only-token');
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toMatch(/\/studio\/quota\/turns$/);
      expect(JSON.parse(String(init?.body))).toMatchObject({ kind: 'message' });
      return Response.json(
        { detail: 'Has llegado al límite de 100 mensajes por día con el asistente.' },
        { status: 429 },
      );
    });
    vi.stubGlobal('fetch', fetch);
    const { reserveTurn } = await import('./studio-server');
    await expect(
      reserveTurn('owner', 'message', { TATTOO_CONSULTATION_BACKEND: 'claude' }),
    ).rejects.toMatchObject({ status: 429, message: expect.stringContaining('límite') });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('counts nothing when the consultation spends nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { reserveTurn } = await import('./studio-server');
    await reserveTurn('owner', 'message', {});
    expect(fetch).not.toHaveBeenCalled();
  });
});
