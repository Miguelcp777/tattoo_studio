import type { ReferenceImage } from '../types';

export function referenceQueries(subject: string): string[] {
  const queries: string[] = [];
  if (/mare de d[eé]u|desamparats|geperudeta/i.test(subject))
    queries.push('"Estàtua de la mare de Déu dels Desemparats" -darrere');
  if (/senyera valenciana|real senyera|senyera/i.test(subject))
    queries.push('"Flag of the Valencian Community" -simplified');
  if (/valencia\s*c\.?\s*f\.?|\bvcf\b/i.test(subject)) queries.push('Valencia CF crest');
  return queries.length ? queries : [subject.slice(0, 180)];
}
const plain = (value: unknown) =>
  typeof value === 'string' ? value.replace(/<[^>]*>/g, '').slice(0, 500) : '';
export class VisualSearchAgent {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}
  async scoutReferenceImages(params: {
    userInput: string;
    userUploadedImages?: ReferenceImage[];
    queries?: string[];
  }): Promise<{ scoutedImages: ReferenceImage[]; reportMessage: string }> {
    if (params.userUploadedImages?.length)
      return {
        scoutedImages: [],
        reportMessage:
          'Se usarán tus referencias. Su contenido se analizará durante la preparación del diseño.',
      };
    const images: ReferenceImage[] = [];
    for (const query of params.queries ?? referenceQueries(params.userInput)) {
      if (query === 'Valencia CF crest') {
        const official = await this.valenciaCrest(query);
        if (official) {
          images.push(official);
          continue;
        }
      }
      const alternatives =
        query === 'Valencia CF crest'
          ? ['"Valencia CF" (logo OR crest OR escudo)', '"Valencia" "escudo"']
          : [query];
      for (const search of alternatives) {
        try {
          const found = await this.commons(search, query);
          if (found) {
            images.push(found);
            break;
          }
        } catch {
          // A failed entity/source must not discard references already found.
        }
      }
    }
    return {
      scoutedImages: images,
      reportMessage: images.length
        ? 'He localizado referencias con su fuente de procedencia. Revisa que representan los elementos que has pedido; la selección automática no certifica su exactitud.'
        : 'No he encontrado una referencia adecuada en las fuentes consultadas. Puedes reintentar la búsqueda o adjuntar una imagen.',
    };
  }

  private async valenciaCrest(query: string): Promise<ReferenceImage | undefined> {
    // Official navigation crest, verified on /es/club/escudos. Check it live, never fake success.
    const source = 'https://www.valenciacf.com/svg/escudo.svg';
    try {
      const response = await this.request(source, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) return;
      return {
        source,
        referenceQuery: query,
        mimeType: 'image/png', // BFF rasterizes this exact SVG.
        label: 'Escudo Valencia CF · web oficial',
        sourcePage: 'https://www.valenciacf.com/es/club/escudos',
        license: 'Derechos del Valencia CF',
        retrievedAt: new Date().toISOString(),
        verification: 'candidate',
      };
    } catch {
      return;
    }
  }

  private async commons(search: string, query: string): Promise<ReferenceImage | undefined> {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: search,
      gsrnamespace: '6',
      gsrlimit: '5',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '1200',
      origin: '*',
    }).toString();
    const response = await this.request(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'InkCraft/0.1 (reference research)' },
    });
    if (!response.ok)
      throw new Error(
        'La búsqueda de referencias no está disponible. Adjunta una referencia o inténtalo de nuevo.',
      );
    const data = await response.json();
    const pages = Object.values(data.query?.pages ?? {}) as Array<{
      title?: string;
      index?: number;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        mime?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
    for (const page of pages.sort((a, b) => (a.index ?? 999) - (b.index ?? 999))) {
      if (
        query === 'Valencia CF crest' &&
        !/valencia.*(?:crest|logo|escudo)|(?:crest|logo|escudo).*valencia/i.test(page.title ?? '')
      )
        continue;
      const info = page.imageinfo?.[0];
      const source = info?.thumburl ?? info?.url;
      if (!source) continue;
      const imageUrl = new URL(source);
      if (
        imageUrl.protocol !== 'https:' ||
        !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(imageUrl.hostname)
      )
        continue;
      imageUrl.search = '';
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(info?.mime ?? ''))
        continue;
      // SVG thumbnails are rasterized by Wikimedia, never run supplied SVG code.
      if (info?.mime === 'image/svg+xml' && !info.thumburl) continue;
      return {
        source: imageUrl.toString(),
        referenceQuery: query,
        mimeType: info?.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        label: plain(page.title),
        sourcePage: info?.descriptionurl ?? 'https://commons.wikimedia.org',
        license: plain(info?.extmetadata?.['LicenseShortName']?.value),
        retrievedAt: new Date().toISOString(),
        verification: 'candidate',
      };
    }
  }
}
