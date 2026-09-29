import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ADR-0019, narrowed by ADR-0022: the live camera never leaves the device. The single exception is
 * one photograph the client takes with the shutter and chooses to keep. Both halves of that are
 * checked against the source rather than trusted:
 *
 * - the page, the compositor and the blend make no request and serialise no frame;
 * - `lib/capture` is the only code that turns a frame into bytes or sends them, it sends to one
 *   route, it never runs on a timer or a loop, and the page calls it from exactly one place each.
 */
const here = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(here, path), 'utf8');
const page = read('src/app/probar/page.tsx');
const blend = read('src/lib/skin-blend.ts');
const compositor = read('src/lib/try-on.ts');
const capture = read('src/lib/capture.ts');

/** Anything that could carry bytes off the page. */
const EGRESS =
  /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|RTCPeerConnection|FormData|new\s+Worker\b/;
/** Anything that turns a frame into bytes, or records the stream. */
const SERIALISE = /toDataURL|toBlob|MediaRecorder|captureStream/;
/** Anything that would make a capture happen without a press. */
const REPEATING = /requestAnimationFrame|setInterval|setTimeout/;

const count = (source: string, pattern: RegExp): number =>
  [...source.matchAll(new RegExp(pattern.source, 'g'))].length;

describe('the try-on keeps the camera on the device (ADR-0019, ADR-0022)', () => {
  it('neither the blend nor the compositor makes a request or serialises a frame', () => {
    for (const source of [blend, compositor]) {
      expect(source).not.toMatch(EGRESS);
      expect(source).not.toMatch(SERIALISE);
    }
  });

  it('the page never sends or serialises anything itself, and reads only its own design', () => {
    expect(page).not.toMatch(EGRESS);
    expect(page).not.toMatch(SERIALISE);
    // The one network read is the design image, by asset id.
    const sources = [...page.matchAll(/\.src\s*=\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(sources).toEqual(['/api/media?id=${id}']);
  });

  it('the design id is validated before it is put in a URL', () => {
    expect(page).toMatch(/\^\[a-f0-9\]\{32\}\$/);
  });
});

describe('the one photograph that may leave (ADR-0022)', () => {
  it('is sent by one call, to one route, never on a timer', () => {
    expect(count(capture, /\bfetch\s*\(/)).toBe(1);
    expect(capture).toMatch(/fetch\('\/api\/captures'/);
    expect(capture).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket|RTCPeerConnection/);
    expect(capture).not.toMatch(REPEATING);
    expect(capture).not.toMatch(/MediaRecorder|captureStream/);
  });

  it('is taken and kept from exactly one place on the page each', () => {
    expect(count(page, /\bsnapshot\s*\(/)).toBe(1);
    expect(count(page, /\bsaveCapture\s*\(/)).toBe(1);
  });

  it('is kept only from the Keep handler, never from the loop', () => {
    const keep = page.slice(page.indexOf('async function keep()'));
    const keepBody = keep.slice(0, keep.indexOf('\n  }\n') + 4);
    expect(keepBody).toMatch(/saveCapture\s*\(/);
    const loop = page.slice(page.indexOf('const loop = useCallback'));
    expect(loop.slice(0, loop.indexOf('}, [paint]);'))).not.toMatch(/snapshot|saveCapture/);
  });
});
