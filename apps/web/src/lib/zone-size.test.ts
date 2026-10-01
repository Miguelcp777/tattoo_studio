import { describe, expect, it } from 'vitest';

import { zoneProposal } from './zone-size';

describe('zoneProposal (TASK-0073)', () => {
  it('fits the design proportions into the zone on its binding side', () => {
    expect(zoneProposal({ widthMm: 150, heightMm: 300 }, { widthMm: 140, heightMm: 260 })).toEqual({
      widthMm: 130,
      heightMm: 260,
    });
    expect(zoneProposal({ widthMm: 200, heightMm: 100 }, { widthMm: 140, heightMm: 260 })).toEqual({
      widthMm: 140,
      heightMm: 70,
    });
  });

  it('proposes nothing without a known zone', () => {
    expect(zoneProposal({ widthMm: 150, heightMm: 300 }, undefined)).toBeUndefined();
  });
});
