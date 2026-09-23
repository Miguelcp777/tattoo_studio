import { describe, expect, it } from 'vitest';

import { catalogueBytes, isCatalogueSource, referenceBytes } from './studio-server';

describe('catalogue references (TASK-0030)', () => {
  it('reads a real catalogue image from disk', async () => {
    const data = Buffer.from(await catalogueBytes('/style-library/tribal/maori.webp'), 'base64');
    // RIFF....WEBP
    expect(data.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(data.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('refuses a path that does not resolve in the catalogue', async () => {
    await expect(catalogueBytes('/style-library/tribal/invented.webp')).rejects.toThrow(
      /no existe/,
    );
    await expect(catalogueBytes('/style-library/nonsense/maori.webp')).rejects.toThrow(/no existe/);
  });

  it('cannot be walked out of the catalogue directory', async () => {
    // The path is rebuilt from what the catalogue returns, never from what arrived, so a
    // traversal attempt fails at resolution rather than at the filesystem.
    for (const attempt of [
      '/style-library/../../../etc/passwd',
      '/style-library/tribal/../../../../secret.webp',
      '/style-library/tribal/maori.webp/../../../x.webp',
      '//evil.test/style-library/tribal/maori.webp',
    ]) {
      expect(isCatalogueSource(attempt), attempt).toBe(false);
      await expect(catalogueBytes(attempt), attempt).rejects.toThrow();
    }
  });

  it('recognises only the catalogue path shape', () => {
    expect(isCatalogueSource('/style-library/tribal/maori.webp')).toBe(true);
    expect(isCatalogueSource('https://upload.wikimedia.org/a.png')).toBe(false);
    expect(isCatalogueSource('/style-library/tribal/maori.png')).toBe(false);
  });

  it('still refuses an external reference outside the allowlist', async () => {
    // The fix must not have widened referenceBytes. That allowlist is the SSRF control.
    await expect(referenceBytes('https://evil.test/x.png')).rejects.toThrow(/no permitida/);
    await expect(referenceBytes('http://upload.wikimedia.org/x.png')).rejects.toThrow(
      /no permitida/,
    );
  });
});
