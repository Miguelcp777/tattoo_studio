import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { referenceBytes } from './studio-server';

afterEach(() => vi.unstubAllGlobals());
it('rasterizes the allowlisted official crest with internal clip paths before worker ingestion', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="120"><defs><clipPath id="c"><rect width="92" height="120"/></clipPath></defs><rect clip-path="url(#c)" width="92" height="120" fill="red"/></svg>',
        ),
    ),
  );
  const data = Buffer.from(
    await referenceBytes('https://www.valenciacf.com/svg/escudo.svg'),
    'base64',
  );
  expect((await sharp(data).metadata()).format).toBe('png');
  expect((await sharp(data).metadata()).width).toBe(1200);
});
it('rejects arbitrary official-domain paths and external SVG resource loading', async () => {
  await expect(referenceBytes('https://www.valenciacf.com/private.svg')).rejects.toThrow(
    'permitida',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<svg><image href="http://127.0.0.1/secret"/></svg>')),
  );
  await expect(referenceBytes('https://www.valenciacf.com/svg/escudo.svg')).rejects.toThrow(
    'formato',
  );
});
it('refuses hosts outside the allowlist and catalogue paths', async () => {
  // The allowlist is the SSRF control. TASK-0038: a catalogue image is not a reference, so no
  // path reaches the worker with one, not even a pick left over in an older session.
  await expect(referenceBytes('https://evil.test/x.png')).rejects.toThrow(/no permitida/);
  await expect(referenceBytes('http://upload.wikimedia.org/x.png')).rejects.toThrow(/no permitida/);
  await expect(referenceBytes('/style-library/tribal/maori.webp')).rejects.toThrow();
});
it('downloads an Openverse thumbnail and nothing else from that host (TASK-0058)', async () => {
  const thumb = 'https://api.openverse.org/v1/images/0ab10347-24ca-470a-83f1-4e07d5bae69b/thumb/';
  const fetched = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetched);
  expect(Buffer.from(await referenceBytes(thumb), 'base64')).toEqual(Buffer.from([1, 2, 3]));
  expect(fetched).toHaveBeenCalledOnce();
  await expect(referenceBytes('https://api.openverse.org/v1/images/')).rejects.toThrow(
    /no permitida/,
  );
  await expect(referenceBytes(`${thumb}?full_size=true`)).rejects.toThrow(/no permitida/);
});
