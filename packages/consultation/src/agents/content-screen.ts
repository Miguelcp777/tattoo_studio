import { metered } from '../usage';

/**
 * Sexually explicit ideas are refused when they are told, not at the image model (TASK-0070,
 * ADR-0031).
 *
 * The image models refuse genitals, sexual acts and explicit nudity. Until now that refusal came
 * at the very end, after the consultation, the reference search and the summary, as an unexplained
 * "(400)". Two checks now come first: OpenAI's text moderation, free and fast, for the plain cases,
 * and the architect's own judgement (rule 11 of the system prompt), which reads context and slang
 * the moderation scores too low. Either one refuses the idea with `CONTENT_REFUSED_MESSAGE`.
 *
 * The moderation is a courtesy, not the safety boundary: the image provider still refuses on its
 * own. So a moderation outage lets the idea through (and is logged) instead of blocking the studio.
 */

export const CONTENT_REFUSED_MESSAGE =
  'No podemos diseñar contenido sexual explícito (genitales, actos sexuales o desnudos ' +
  'explícitos): los generadores de imágenes lo rechazan. Prueba con otra idea.';

export class ContentRefusedError extends Error {
  constructor() {
    super(CONTENT_REFUSED_MESSAGE);
    this.name = 'ContentRefusedError';
  }
}

export interface TextScreen {
  /** True when the text asks for sexually explicit content. Never throws. */
  refuses(text: string): Promise<boolean>;
}

/**
 * Above this `sexual` score the moderation refuses by itself. Measured on 2026-10-01: a sexual act
 * and a topless figure scored 0.92; genitals named plainly 0.57 to 0.88; a nude seen from behind
 * and covered by flowers 0.84, which the studio accepts; ordinary suggestive motifs (a winking
 * pin-up, a geisha, lovers embracing) 0.06 to 0.60. So only the clearest cases are refused here;
 * everything below is the architect's to judge (rule 11), and it refused every genital case.
 */
export const SEXUAL_SCORE_LIMIT = 0.9;

interface ModerationResult {
  categories?: Record<string, unknown>;
  category_scores?: Record<string, unknown>;
}

export function refusedByModeration(result: ModerationResult | undefined): boolean {
  if (!result) return false;
  if (result.categories?.['sexual/minors'] === true) return true;
  const score = result.category_scores?.['sexual'];
  return typeof score === 'number' && score >= SEXUAL_SCORE_LIMIT;
}

const ENDPOINT = 'https://api.openai.com/v1/moderations';
export const TEXT_MODERATION_MODEL = 'omni-moderation-latest';

export class OpenAITextModeration implements TextScreen {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = (...args) => fetch(...args),
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  }

  async refuses(text: string): Promise<boolean> {
    if (!text.trim()) return false;
    try {
      const response = await metered(
        { provider: 'openai', operation: 'text_moderation', model: TEXT_MODERATION_MODEL },
        async () => {
          const answer = await this.request(ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: TEXT_MODERATION_MODEL, input: text.slice(0, 4000) }),
            signal: AbortSignal.timeout(8000),
          });
          if (!answer.ok) throw new Error(`Text moderation answered ${answer.status}.`);
          return answer;
        },
      );
      const body = (await response.json()) as { results?: ModerationResult[] };
      return refusedByModeration(body.results?.[0]);
    } catch (error) {
      // Status only: no user text and no credential in the log line.
      console.warn(
        `Text moderation unavailable (${error instanceof Error ? error.message : 'error'}); ` +
          'the architect and the image provider still check the idea.',
      );
      return false;
    }
  }
}
