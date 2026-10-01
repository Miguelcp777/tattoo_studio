import { describe, expect, it } from 'vitest';

import { BAR_CEILING, clock, inkStage, type InkTask } from './ink-progress';

const TASKS: InkTask[] = [
  'idea',
  'save',
  'search',
  'image',
  'accept',
  'reset',
  'preparing',
  'queued',
  'running',
];

describe('inkStage (TASK-0069)', () => {
  it('starts at the first line with an empty bar', () => {
    for (const task of TASKS) {
      const stage = inkStage(task, 0);
      expect(stage.title).toBeTruthy();
      expect(stage.line).toBeTruthy();
      expect(stage.progress).toBe(0);
    }
  });

  it('moves through the lines and stays on the last one', () => {
    expect(inkStage('idea', 0).line).toBe('Leyendo tu idea…');
    expect(inkStage('idea', 5000).line).not.toBe('Leyendo tu idea…');
    const last = inkStage('idea', 60_000).line;
    expect(inkStage('idea', 10 * 60_000).line).toBe(last);
  });

  it('grows the bar, never backwards and never to the end', () => {
    for (const task of TASKS) {
      let previous = -1;
      for (const ms of [0, 1000, 5000, 20_000, 60_000, 600_000, 3_600_000]) {
        const { progress } = inkStage(task, ms);
        expect(progress).toBeGreaterThanOrEqual(previous);
        expect(progress).toBeLessThanOrEqual(BAR_CEILING);
        previous = progress;
      }
      expect(previous).toBeLessThan(1);
    }
  });

  it('treats a clock that went backwards as the start', () => {
    expect(inkStage('running', -500)).toEqual(inkStage('running', 0));
  });
});

describe('clock', () => {
  it('reads minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(7_900)).toBe('0:07');
    expect(clock(151_000)).toBe('2:31');
  });
});
