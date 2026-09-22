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
