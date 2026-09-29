import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TASK-0051. Two layout promises that no behaviour test would notice breaking, checked in source.
 */
const here = resolve(__dirname, '../..');
// Comments removed, or one sitting above a rule would be read as part of its selector.
const css = readFileSync(resolve(here, 'src/app/globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const modal = readFileSync(resolve(here, 'src/components/TattooPreviewModal.tsx'), 'utf8');

describe('the brand stays in view', () => {
  it('no rule gives the studio header a position other than sticky', () => {
    // A later `position: relative` on a shared selector list once overrode the sticky header, so
    // the brand scrolled away with the page and nothing failed.
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const onHeader = rules.filter(([, selectors]) =>
      selectors!.split(',').some((selector) => selector.trim() === '.studio-header'),
    );
    const positions = onHeader.flatMap(([, , body]) =>
      [...body!.matchAll(/position:\s*([a-z-]+)/g)].map((match) => match[1]),
    );
    expect(positions).toEqual(['sticky']);
  });
});

describe('a finished design opens on its pictures', () => {
  it('the images come before the downloads, and both before the change form', () => {
    const images = modal.indexOf('className="result-grid"');
    const downloads = modal.indexOf('className="download-row"');
    const changes = modal.indexOf('className="proposal-edit');
    expect(images).toBeGreaterThan(0);
    expect(images).toBeLessThan(downloads);
    expect(downloads).toBeLessThan(changes);
  });
});

describe('the camera try-on has a way back (TASK-0053)', () => {
  it('offers a link to the studio in a bar that stays in view', () => {
    // Installed as an app there is no browser back button: without this the page is a dead end.
    const tryOn = readFileSync(resolve(here, 'src/app/probar/page.tsx'), 'utf8');
    expect(tryOn).toMatch(/className="try-on-back"\s+href="\/"/);
    const bar = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      ([, selectors]) => selectors!.trim() === '.try-on-bar',
    );
    expect(bar?.[2]).toMatch(/position:\s*sticky/);
  });
});
