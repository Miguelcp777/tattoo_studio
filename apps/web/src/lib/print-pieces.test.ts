import { describe, expect, it } from 'vitest';

import { needsA4Pieces } from './print-pieces';

describe('A4 pieces (TASK-0088)', () => {
  it('matches the worker: a 15 × 30 cm calf design needs them, an 8 × 15 cm one does not', () => {
    expect(needsA4Pieces({ widthMm: 150, heightMm: 300 })).toBe(true);
    expect(needsA4Pieces({ widthMm: 80, heightMm: 150 })).toBe(false);
    expect(needsA4Pieces({ widthMm: 195, heightMm: 100 })).toBe(true);
  });
});
