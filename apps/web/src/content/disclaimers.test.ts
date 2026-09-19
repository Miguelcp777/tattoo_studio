import { describe, expect, it } from 'vitest';

import { AGING_DISCLAIMER, ARTIST_STYLE_NOTICE, VISUALIZATION_DISCLAIMER } from './disclaimers';

describe('required disclaimer copy (WEB-INV-003)', () => {
  it('states that output is a visualization rather than a guarantee', () => {
    expect(VISUALIZATION_DISCLAIMER).toContain('visualization');
    expect(VISUALIZATION_DISCLAIMER).toContain('not a guarantee');
  });

  it('marks aging output as illustrative and explicitly not a prediction', () => {
    expect(AGING_DISCLAIMER).toContain('Illustrative');
    expect(AGING_DISCLAIMER).toContain('not a prediction');
  });

  it('declines living-artist style mimicry (PROD-INV-004)', () => {
    expect(ARTIST_STYLE_NOTICE).toContain('do not imitate');
  });

  it('has no empty disclaimer, which would silently satisfy a naive render check', () => {
    for (const copy of [VISUALIZATION_DISCLAIMER, AGING_DISCLAIMER, ARTIST_STYLE_NOTICE]) {
      expect(copy.trim().length).toBeGreaterThan(40);
    }
  });
});
