import Anthropic from '@anthropic-ai/sdk';

import { completedText } from '../providers/claude';
import { metered } from '../usage';
import type {
  JudgeCandidate,
  PlannedQuery,
  ReferenceJudge,
  ScoutQueryPlanner,
} from './image-scout';

/**
 * The visual scout's two Claude Sonnet 5 roles (TASK-0032/REQ-005, TASK-0034).
 *
 * - The **planner** decides what to search for: short queries of concrete nouns, marked essential
 *   only for a specific entity whose exact look matters, each with a Spanish label for messages.
 * - The **judge** looks at the candidate images and keeps only those that actually show what the
 *   client asked for. A live survey showed why: the first Commons hit for a howling wolf was a
 *   "Red Moon logo", for a rose an Adenium flower.
 *
 * Both use structured outputs, so replies always parse. Any failure surfaces as an exception;
 * `VisualSearchAgent` catches it (planner → deterministic queries; judge → keep nothing unverified).
 * `fetch` is injectable so both are testable offline.
 */

export const CLAUDE_SCOUT_MODEL = 'claude-sonnet-5';

const PLANNER_PROMPT = `You plan image searches on Wikimedia Commons and Openverse (openly licensed photos and artwork) that find visual references for a tattoo design.
Return 1 to 3 queries, one per concrete thing the client wants depicted.
Each query is 1 to 4 English words naming that thing, as a Commons file might be titled: "howling wolf", "red rose", "human skull", "nautical compass", "Great Wave off Kanagawa".
Never add words about the medium or the source: no "photo", "illustration", "image", "picture", "drawing", "art", "Wikimedia", "Commons", "public domain", "high resolution", "official", "logo design".
Set "essential" to true only for a specific real-world entity whose exact appearance matters: a named emblem, crest, flag, landmark, statue, artwork or logo. Generic animals, plants, objects and scenes are false.
"label" is a short Spanish name for what the image must show, e.g. "el escudo del FC Barcelona", "un lobo aullando".
Never search for a real private person or for another tattoo artist's work.`;

const PLANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['queries'],
  properties: {
    queries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['query', 'essential', 'label'],
        properties: {
          query: { type: 'string' },
          essential: { type: 'boolean' },
          label: { type: 'string' },
        },
      },
    },
  },
};

const JUDGE_PROMPT = `You check candidate reference images for a tattoo design.
Each image is numbered and tagged with the search that found it. Keep only images that clearly and literally depict the thing that search was for, as the client described it.
Reject logos or text of unrelated things, maps or scenes that merely share a word, different species or objects, and anything unclear.
Reject every image in which a person or any part of a human body appears, including skin, a face, hands, or a tattooed arm, leg, back or torso: the studio cannot use a stranger's body, and its safety check refuses it. A tattoo design drawn on paper or screen, a flash sheet, a painting, a sculpture or an object is fine.
For a specific emblem, crest, flag or logo, keep only its current official design: reject historical, retired, simplified, fan-made or alternative versions unless the client asked for that version.
Return the numbers of the images to keep, best first. Returning none is correct when none fit.`;

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['keep'],
  properties: { keep: { type: 'array', items: { type: 'integer' } } },
};

export interface ClaudeScoutConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

function client(config: ClaudeScoutConfig, timeout: number, request?: typeof fetch) {
  const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  return apiKey
    ? new Anthropic({
        apiKey,
        timeout: config.timeoutMs ?? timeout,
        maxRetries: 0,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(request ? { fetch: request } : {}),
      })
    : undefined;
}

export class ClaudeScoutQueryPlanner implements ScoutQueryPlanner {
  private readonly client: Anthropic | undefined;
  private readonly model: string;

  constructor(config: ClaudeScoutConfig = {}, request?: typeof fetch) {
    this.client = client(config, 15000, request);
    this.model = config.model ?? CLAUDE_SCOUT_MODEL;
  }

  async plan(subject: string): Promise<PlannedQuery[]> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY is not configured for the scout.');
    const client = this.client;
    const message = await metered(
      { provider: 'anthropic', operation: 'scout_plan', model: this.model },
      () =>
        client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: PLANNER_PROMPT,
          messages: [{ role: 'user', content: subject.slice(0, 500) }],
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: PLANNER_SCHEMA },
          },
        }),
    );
    const parsed = JSON.parse(completedText(message)) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) throw new Error('Scout planner did not return queries.');
    return parsed.queries
      .map((item) => item as { query?: unknown; essential?: unknown; label?: unknown })
      .filter((item) => typeof item.query === 'string' && item.query.trim().length > 0)
      .map((item) => ({
        query: String(item.query).trim().slice(0, 120),
        essential: item.essential === true,
        ...(typeof item.label === 'string' && item.label.trim()
          ? { label: item.label.trim().slice(0, 120) }
          : {}),
      }))
      .slice(0, 3);
  }
}

export class ClaudeReferenceJudge implements ReferenceJudge {
  private readonly client: Anthropic | undefined;
  private readonly model: string;

  constructor(config: ClaudeScoutConfig = {}, request?: typeof fetch) {
    this.client = client(config, 30000, request);
    this.model = config.model ?? CLAUDE_SCOUT_MODEL;
  }

  async choose(subject: string, candidates: JudgeCandidate[]): Promise<number[]> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY is not configured for the judge.');
    if (!candidates.length) return [];
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: `Idea del cliente: ${subject.slice(0, 500)}` },
    ];
    candidates.forEach((candidate, index) => {
      content.push({
        type: 'text',
        text: `Imagen ${index} · búsqueda "${candidate.query}" · archivo "${candidate.title.slice(0, 160)}"`,
      });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: candidate.mediaType, data: candidate.data },
      });
    });
    const client = this.client;
    const message = await metered(
      { provider: 'anthropic', operation: 'scout_judge', model: this.model },
      () =>
        client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: JUDGE_PROMPT,
          messages: [{ role: 'user', content }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
        }),
    );
    const parsed = JSON.parse(completedText(message)) as { keep?: unknown };
    if (!Array.isArray(parsed.keep)) throw new Error('Reference judge did not return a list.');
    return parsed.keep.filter(
      (i): i is number => Number.isInteger(i) && i >= 0 && i < candidates.length,
    );
  }
}
