import { describe, expect, it } from 'vitest';
import { OrchestratorAgent } from '@tattoo/consultation';

import { buildOrchestrator, liveAgentConfig } from './studio-server';

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
