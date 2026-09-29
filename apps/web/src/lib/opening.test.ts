import { describe, expect, it } from 'vitest';

import { openingFor, reopensNewest } from './opening';

describe('what the studio opens with (TASK-0046)', () => {
  it('shows the account designs when this browser has no consultation', () => {
    // AC-007. The case that used to end in an empty studio: signed in, nothing in progress.
    const opening = openingFor({ session: null });
    expect(opening).toEqual({ restore: 'designs', jobId: null });
    expect(reopensNewest(opening)).toBe(true);
  });

  it('restores the conversation when there is one, with the job it left running', () => {
    expect(openingFor({ session: { sessionId: 'x' }, jobId: 'b'.repeat(32) })).toEqual({
      restore: 'conversation',
      jobId: 'b'.repeat(32),
    });
    expect(openingFor({ session: { sessionId: 'x' } })).toEqual({
      restore: 'conversation',
      jobId: null,
    });
  });

  it('does not replace a design that is still being generated', () => {
    const opening = openingFor({ session: { sessionId: 'x' }, jobId: 'b'.repeat(32) });
    for (const state of ['queued', 'running']) expect(reopensNewest(opening, state)).toBe(false);
    for (const state of ['succeeded', 'failed', 'cancelled'])
      expect(reopensNewest(opening, state)).toBe(true);
  });

  it('opens the newest design even when a stale job id is in play', () => {
    // No conversation means nothing on screen to protect, whatever the job says.
    expect(reopensNewest({ restore: 'designs', jobId: null }, 'running')).toBe(true);
  });
});
