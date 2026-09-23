import { describe, expect, it } from 'vitest';

import { findOffer, offerAsReference, styleLabel, styleOffers } from '../agents/style-library';
import { STYLE_OPTIONS } from '../agents/researcher';

describe('style catalogue (TASK-0028)', () => {
  it('offers three variants for every style in the vocabulary', () => {
    for (const style of Object.keys(STYLE_OPTIONS)) {
      const offers = styleOffers(style);
      expect(offers, style).toHaveLength(3);
      expect(new Set(offers.map((o) => o.id)).size, style).toBe(3);
    }
  });

  it('points at the catalogue image the generator writes', () => {
    const [first] = styleOffers('tribal');
    expect(first!.image).toBe('/style-library/tribal/polynesian.webp');
    expect(first!.styleLabel).toBe('Tribal');
    expect(first!.characteristics).toBeTruthy();
  });

  it('offers nothing for an unknown or absent style', () => {
    expect(styleOffers('tribal_freehand')).toEqual([]);
    expect(styleOffers(undefined)).toEqual([]);
    expect(styleLabel('tribal_freehand')).toBeUndefined();
  });

  it('finds an offer by its identity and rejects a made-up one', () => {
    expect(findOffer('tribal:maori')?.label).toBe('Maorí');
    expect(findOffer('tribal:nonexistent')).toBeUndefined();
    expect(findOffer('nonsense')).toBeUndefined();
  });

  it('records the pick as a studio render, never as the client s own', () => {
    const offer = findOffer('tribal:maori')!;
    const reference = offerAsReference(offer);
    expect(reference.verification).toBe('style_library');
    expect(reference.verification).not.toBe('user_supplied');
    expect(reference.source).toBe(offer.image);
    expect(reference.mimeType).toBe('image/webp');
    expect(reference.license).toMatch(/ilustrativo/i);
  });

  it('never names a person in a variant description (PROD-INV-004)', () => {
    // A style may be named after a culture or a school; it may not be named after an artist.
    const forbidden = /\b(?:by|de)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/;
    for (const style of Object.keys(STYLE_OPTIONS)) {
      for (const offer of styleOffers(style)) {
        expect(offer.characteristics, offer.id).not.toMatch(forbidden);
      }
    }
  });
});
