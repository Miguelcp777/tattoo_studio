import { describe, expect, it } from 'vitest';

import { applyInk, blur, dilate, surfaceFalloff } from './skin-blend';

const W = 64;
const H = 64;

/** A skin-toned frame, optionally lit from the left so it has a form to read. */
function frame(gradient = false): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const shade = gradient ? 1 - (0.45 * x) / (W - 1) : 1;
      const p = (y * W + x) * 4;
      pixels[p] = 226 * shade;
      pixels[p + 1] = 190 * shade;
      pixels[p + 2] = 168 * shade;
      pixels[p + 3] = 255;
    }
  }
  return pixels;
}

/** Artwork on white with a mid-grey bar; solid black would hide the tint being asserted on. */
function design(grey = 110, from = 26, to = 38): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const inked = x >= from && x < to;
      pixels[p] = inked ? grey : 255;
      pixels[p + 1] = inked ? grey : 255;
      pixels[p + 2] = inked ? grey : 255;
      pixels[p + 3] = 255;
    }
  }
  return pixels;
}

const at = (pixels: Uint8ClampedArray, x: number, y: number): [number, number, number] => {
  const p = (y * W + x) * 4;
  return [pixels[p]!, pixels[p + 1]!, pixels[p + 2]!];
};

describe('surface attenuation (ADR-0014, ported in TASK-0042)', () => {
  it('attenuates more where the frame is darker, and not at all on a flat one', () => {
    const lit = surfaceFalloff(frame(true), W, H, 0.35);
    const bright = lit[32 * W + 1]!;
    const dim = lit[32 * W + (W - 2)]!;
    expect(bright).toBeGreaterThan(dim);
    expect(bright).toBeLessThanOrEqual(1);
    expect(dim).toBeGreaterThan(0);

    const flat = surfaceFalloff(frame(false), W, H, 0.35);
    for (const value of flat) expect(value).toBeCloseTo(1, 2);
  });

  it('never attenuates beyond the limit, whatever strength is asked for', () => {
    for (const value of surfaceFalloff(frame(true), W, H, 99)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('returns no attenuation for a black frame rather than dividing by nothing', () => {
    const black = new Uint8ClampedArray(W * H * 4);
    for (const value of surfaceFalloff(black, W, H, 0.5)) expect(value).toBe(1);
  });
});

describe('ink on skin (TASK-0042)', () => {
  it('multiplies ink into the skin and leaves bare skin untouched', () => {
    const skin = frame();
    const before = at(skin, 5, 32);
    applyInk(skin, design(), W, H, { freshness: 0, surface: 0 });
    expect(at(skin, 5, 32)).toEqual(before); // white artwork: nothing applied
    const inked = at(skin, 32, 32);
    expect(inked[0]).toBeLessThan(before[0]);
  });

  it('a fully transparent design changes nothing', () => {
    const skin = frame();
    const before = [...skin];
    const clear = design();
    for (let p = 3; p < clear.length; p += 4) clear[p] = 0;
    applyInk(skin, clear, W, H, { freshness: 0, surface: 0 });
    expect([...skin]).toEqual(before);
  });

  it('moves no ink: only pixels the design darkens are changed', () => {
    // MOCKUP-INV-001 in the browser. The plain multiply touches exactly the inked columns.
    const skin = frame();
    const before = [...skin];
    applyInk(skin, design(), W, H, { freshness: 0, surface: 0 });
    for (let x = 0; x < W; x++) {
      const p = (32 * W + x) * 4;
      const changed = skin[p] !== before[p];
      expect(changed, `column ${x}`).toBe(x >= 26 && x < 38);
    }
  });

  it('reddens the skin around the strokes, not the pigment itself (TASK-0031)', () => {
    const skin = frame();
    applyInk(skin, design(), W, H, { freshness: 2, surface: 0 });
    const warmth = (x: number): number => {
      const [r, g, b] = at(skin, x, 32);
      return r - (g + b) / 2;
    };
    const plain = frame();
    applyInk(plain, design(), W, H, { freshness: 0, surface: 0 });
    const baseline = ((): number => {
      const [r, g, b] = at(plain, 5, 32);
      return r - (g + b) / 2;
    })();
    // Just outside the bar the skin is warmer than bare skin; well away from it, it is not.
    expect(warmth(24)).toBeGreaterThan(baseline);
    expect(warmth(1)).toBeCloseTo(baseline, 0);
    // The ring is around the ink: the skin beside a stroke reddens more than the stroke's middle.
    expect(warmth(24)).toBeGreaterThan(warmth(32));
  });
});

describe('blur and dilate helpers', () => {
  it('blur spreads a spike without changing the total much', () => {
    const spike = new Float32Array(W * H);
    spike[32 * W + 32] = 100;
    const spread = blur(spike, W, H, 3);
    expect(spread[32 * W + 32]).toBeLessThan(100);
    expect(spread[32 * W + 34]).toBeGreaterThan(0);
    const sum = spread.reduce((total, value) => total + value, 0);
    expect(sum).toBeGreaterThan(90);
    expect(sum).toBeLessThan(110);
  });

  it('dilate grows a mark by its radius in both directions', () => {
    const mark = new Float32Array(W * H);
    mark[32 * W + 32] = 1;
    const grown = dilate(mark, W, H, 2);
    expect(grown[32 * W + 34]).toBe(1);
    expect(grown[34 * W + 32]).toBe(1);
    expect(grown[32 * W + 35]).toBe(0);
  });
});
