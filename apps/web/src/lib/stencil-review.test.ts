import { describe, expect, it } from 'vitest';

import { stencilNotes } from './stencil-review';

describe('how far to trust a stencil (TASK-0086, audit ARQ-03)', () => {
  it('a full-detail line-art trace is not preliminary', () => {
    expect(stencilNotes({ method: 'lineart', simplification: 0 }).preliminary).toBe(false);
  });

  it('colour contours and simplification are said, and make it preliminary', () => {
    const colour = stencilNotes({ method: 'colour_contours', simplification: 2 });
    expect(colour.preliminary).toBe(true);
    expect(colour.notes.join(' ')).toMatch(/aproximados/);
    expect(colour.notes.join(' ')).toMatch(/nivel 2 de 3/);
  });

  it('a result from before the field is treated as preliminary', () => {
    expect(stencilNotes(undefined).preliminary).toBe(true);
  });
});
