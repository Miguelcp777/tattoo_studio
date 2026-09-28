import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ADR-0019: the camera frames never leave the device. The promise is the feature, so it is checked
 * against the source rather than trusted: the try-on page may make exactly one request — the GET
 * that fetches the client's own design — and the blend module may make none.
 */
const here = resolve(__dirname, '../../..');
const page = readFileSync(resolve(here, 'src/app/probar/page.tsx'), 'utf8');
const blend = readFileSync(resolve(here, 'src/lib/skin-blend.ts'), 'utf8');
const compositor = readFileSync(resolve(here, 'src/lib/try-on.ts'), 'utf8');

/** Anything that could carry bytes off the page. */
const EGRESS =
  /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|RTCPeerConnection|FormData|new\s+Worker\b/;

describe('the try-on keeps the camera on the device (ADR-0019)', () => {
  it('neither the blend nor the compositor makes a request of any kind', () => {
    expect(blend).not.toMatch(EGRESS);
    expect(compositor).not.toMatch(EGRESS);
  });

  it('the page never posts, and reads only its own design', () => {
    expect(page).not.toMatch(EGRESS);
    // The one network access is the design image, by asset id, through the session-scoped route.
    const sources = [...page.matchAll(/\.src\s*=\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(sources).toEqual(['/api/media?id=${id}']);
    expect(page).not.toMatch(/toDataURL|toBlob/);
  });

  it('the design id is validated before it is put in a URL', () => {
    expect(page).toMatch(/\^\[a-f0-9\]\{32\}\$/);
  });
});
