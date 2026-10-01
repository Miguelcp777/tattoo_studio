import { describe, expect, it } from 'vitest';

import { STYLE_OPTIONS } from '@tattoo/consultation/preferences';
import { styleOffers } from '@tattoo/consultation/style-library';

import { STYLE_HINTS } from './style-hints';

describe('style hints are Spanish and complete (TASK-0084, audit)', () => {
  it('every catalogue variant has its Spanish description', () => {
    const missing = Object.keys(STYLE_OPTIONS)
      .flatMap((style) => styleOffers(style))
      .map((offer) => `${offer.style}.${offer.variant}`)
      .filter((key) => !STYLE_HINTS[key]);
    expect(missing).toEqual([]);
  });

  it('none is the English prompt text', () => {
    for (const style of Object.keys(STYLE_OPTIONS))
      for (const offer of styleOffers(style))
        expect(STYLE_HINTS[`${offer.style}.${offer.variant}`]).not.toBe(offer.characteristics);
  });
});
