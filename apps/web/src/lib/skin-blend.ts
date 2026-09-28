/**
 * The ink treatment, in the browser (TASK-0042, ADR-0019).
 *
 * A faithful port of the worker's `mockup/engine.py` composite so the live camera try-on shows the
 * same ink the studio renders: a multiply against the skin, the surface attenuation read from the
 * frame's own light (ADR-0014), and the fresh-ink ring around the strokes (TASK-0031).
 *
 * Two rules carry over unchanged:
 *
 * - **The artwork's geometry is authoritative** (MOCKUP-INV-001). Nothing here displaces a pixel of
 *   the design; the only spatial transform is the placement the client chooses. Attenuation scales
 *   opacity, it does not move ink.
 * - **It is a visualization, never a prediction** (PROD-INV-005). The caller labels it.
 *
 * Pure and synchronous: it takes and returns pixel buffers, touches no DOM and opens no socket, so
 * a camera frame cannot leave the device through this module (ADR-0019).
 */

/** Strength of the fresh-ink ring, as `DEFAULT_FRESHNESS` in the worker. */
export const DEFAULT_FRESHNESS = 2.0;

/** Default surface attenuation, as `DEFAULT_SURFACE` in the worker. */
export const DEFAULT_SURFACE = 0.35;

/** Strongest attenuation the surface term may apply; 1 would erase the ink. */
export const SURFACE_LIMIT = 1.0;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Separable box blur, three passes, which approximates a Gaussian closely enough for a form
 * reading. Chosen over a canvas filter so the maths runs identically under test and on a phone.
 */
export function blur(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  let current = source;
  const span = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass++) {
    current = boxPass(current, width, height, span, true);
    current = boxPass(current, width, height, span, false);
  }
  return current;
}

function boxPass(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Float32Array {
  const out = new Float32Array(source.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const step = horizontal ? 1 : width;
  const window = radius * 2 + 1;
  for (let line = 0; line < outer; line++) {
    const base = horizontal ? line * width : line;
    // Prime the running sum with the edge value repeated, so borders do not darken.
    let sum = source[base]! * (radius + 1);
    for (let i = 1; i <= radius; i++) sum += source[base + Math.min(i, inner - 1) * step]!;
    for (let i = 0; i < inner; i++) {
      out[base + i * step] = sum / window;
      const ahead = source[base + Math.min(i + radius + 1, inner - 1) * step]!;
      const behind = source[base + Math.max(i - radius, 0) * step]!;
      sum += ahead - behind;
    }
  }
  return out;
}

/** Separable maximum over a square window: the worker's `MaxFilter`, used to dilate coverage. */
export function dilate(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const once = maxPass(source, width, height, radius, true);
  return maxPass(once, width, height, radius, false);
}

function maxPass(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Float32Array {
  const out = new Float32Array(source.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const step = horizontal ? 1 : width;
  for (let line = 0; line < outer; line++) {
    const base = horizontal ? line * width : line;
    for (let i = 0; i < inner; i++) {
      let best = 0;
      const from = Math.max(0, i - radius);
      const to = Math.min(inner - 1, i + radius);
      for (let j = from; j <= to; j++) {
        const value = source[base + j * step]!;
        if (value > best) best = value;
      }
      out[base + i * step] = best;
    }
  }
  return out;
}

/**
 * How much to attenuate the ink at each pixel, read from the frame (ADR-0014).
 *
 * Where a body turns away from the light it darkens, so the skin's own luminance carries its gross
 * form. Blurring the detail away leaves that form; ink on a surface angled away reads lighter, and
 * scaling its opacity says so. Deliberately not a displacement.
 */
export function surfaceFalloff(
  frame: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): Float32Array {
  const luminance = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luminance.length; i++, p += 4) {
    luminance[i] = 0.2126 * frame[p]! + 0.7152 * frame[p + 1]! + 0.0722 * frame[p + 2]!;
  }
  const form = blur(luminance, width, height, Math.max(4, Math.min(width, height) / 12));
  let brightest = 0;
  for (const value of form) if (value > brightest) brightest = value;
  const falloff = new Float32Array(width * height);
  if (brightest < 1e-6) {
    falloff.fill(1);
    return falloff;
  }
  const limited = Math.min(strength, SURFACE_LIMIT);
  for (let i = 0; i < falloff.length; i++) {
    falloff[i] = 1 - limited * clamp01(1 - form[i]! / brightest);
  }
  return falloff;
}

export interface InkOptions {
  /** 0 disables the fresh-ink ring and applies the plain multiply. */
  freshness?: number;
  surface?: number;
}

/**
 * Lay `design` over `frame` in place. Both are RGBA buffers of the same `width` x `height`; the
 * caller has already scaled and positioned the design into that box, so this only decides how the
 * ink sits, never where it is.
 *
 * `design` is artwork on white, as the master is: white is bare skin, dark is ink.
 */
export function applyInk(
  frame: Uint8ClampedArray,
  design: Uint8ClampedArray,
  width: number,
  height: number,
  { freshness = DEFAULT_FRESHNESS, surface = DEFAULT_SURFACE }: InkOptions = {},
): void {
  const pixels = width * height;
  const falloff = surface > 0 ? surfaceFalloff(frame, width, height, surface) : undefined;
  const ink = new Float32Array(pixels * 3);
  const coverage = new Float32Array(pixels);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    // Outside the design's own alpha there is no ink at all, whatever its colour channels hold.
    const present = design[p + 3]! / 255;
    let darkest = 1;
    for (let c = 0; c < 3; c++) {
      let value = design[p + c]! / 255;
      value = 1 - (1 - value) * present;
      if (falloff) value = 1 - (1 - value) * falloff[i]!;
      ink[i * 3 + c] = value;
      if (value < darkest) darkest = value;
    }
    coverage[i] = 1 - darkest;
  }

  if (freshness <= 0) {
    for (let i = 0, p = 0; i < pixels; i++, p += 4) {
      for (let c = 0; c < 3; c++) frame[p + c] = frame[p + c]! * (0.15 + 0.85 * ink[i * 3 + c]!);
    }
    return;
  }

  // Dilate before blurring: the redness must surround the ink, not disappear beneath it.
  const radius = Math.max(1, Math.min(9, Math.round(width * 0.009)));
  const spread = blur(
    dilate(coverage, width, height, radius),
    width,
    height,
    Math.max(1.2, width * 0.008),
  );
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    // Subtracting the ink leaves a ring: fresh ink irritates the skin *around* the strokes.
    const halo = clamp01(spread[i]! - coverage[i]!) * freshness;
    const r = frame[p]!;
    const g = frame[p + 1]!;
    const b = frame[p + 2]!;
    const warm = [r + (255 - r) * halo * 0.14, g * (1 - halo * 0.095), b * (1 - halo * 0.065)];
    const sheenBase = 0.025 * coverage[i]!;
    for (let c = 0; c < 3; c++) {
      const skin = frame[p + c]! / 255;
      const sheen = 255 * sheenBase * skin ** 4;
      frame[p + c] = warm[c]! * (0.07 + 0.93 * ink[i * 3 + c]!) + sheen;
    }
  }
}
