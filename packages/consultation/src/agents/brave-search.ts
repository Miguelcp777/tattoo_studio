import type { ReferenceImage } from '../types';
import { metered } from '../usage';
import type { OpenWebImageSearch } from './image-scout';

/**
 * Web image search through the Brave Search API (TASK-0068, ADR-0030).
 *
 * The last resort for an essential reference — a named logo, crest or flag — that Wikimedia
 * Commons and Openverse do not hold. `VisualSearchAgent` asks it only for those, and shows its
 * candidates to the same judge as every other source, which refuses people, bodies and tattoos.
 *
 * Only the thumbnail Brave serves from its own host is used, so every download goes to one known
 * address (`isBraveThumbnail`, also the web tier's download allowlist). The images keep their
 * authors' rights; they are labelled as such and used only as a reference.
 */

const ENDPOINT = 'https://api.search.brave.com/res/v1/images/search';
const THUMBNAIL_HOST = 'imgs.search.brave.com';
const LICENCE = 'Imagen de la web · derechos de su autor';

/** A Brave-proxied thumbnail: https, Brave's image host, a path and nothing else. */
export function isBraveThumbnail(source: string): boolean {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === THUMBNAIL_HOST &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname.length > 1
  );
}

const plain = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 160)
    : '';

export class BraveImageSearch implements OpenWebImageSearch {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = (...args) => fetch(...args),
    private readonly limit = 3,
  ) {
    if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is not configured.');
  }

  async search(query: string): Promise<ReferenceImage[]> {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      q: query,
      count: '10',
      safesearch: 'strict',
      spellcheck: 'false',
    }).toString();
    // Metered like the paid model calls, so the panel shows what the searches cost (ADR-0024).
    const response = await metered(
      { provider: 'brave', operation: 'web_image_search', model: 'brave-image-search' },
      async () => {
        const answer = await this.request(url, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
          signal: AbortSignal.timeout(10000),
        });
        if (!answer.ok) throw new Error(`Brave image search answered ${answer.status}.`);
        return answer;
      },
    );
    const data = (await response.json()) as { results?: unknown };
    const results = Array.isArray(data.results) ? data.results : [];
    const found: ReferenceImage[] = [];
    for (const item of results as Array<Record<string, unknown>>) {
      if (found.length >= this.limit) break;
      const thumbnail = item['thumbnail'] as { src?: unknown } | undefined;
      const source = typeof thumbnail?.src === 'string' ? thumbnail.src : '';
      if (!isBraveThumbnail(source)) continue;
      const page = typeof item['url'] === 'string' ? item['url'] : '';
      found.push({
        source,
        referenceQuery: query,
        mimeType: 'image/jpeg',
        label: plain(item['title']) || 'Imagen de la web',
        sourcePage: page.startsWith('https://') ? page : 'https://search.brave.com',
        license: LICENCE,
        retrievedAt: new Date().toISOString(),
        verification: 'candidate',
      });
    }
    return found;
  }
}
