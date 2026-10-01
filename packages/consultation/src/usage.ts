/**
 * Reporting what each model call used (TASK-0054).
 *
 * The consultation package makes paid calls — the consultation itself, the scout's search planner
 * and its reference judge — but knows nothing about accounts or where monitoring is kept. It only
 * announces each call; the web tier listens, attributes it to the signed-in account and forwards it.
 * A listener that throws is ignored: reporting never changes a consultation's outcome.
 */

export interface ProviderUsage {
  provider: 'anthropic' | 'openai' | 'brave';
  operation: 'consultation' | 'scout_plan' | 'scout_judge' | 'web_image_search' | 'text_moderation';
  model: string;
  outcome: 'ok' | 'error';
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** The error's name only: a message can quote a request. */
  error?: string;
}

type Listener = (usage: ProviderUsage) => void;

let listener: Listener | undefined;

/** Install (or with `undefined`, remove) the one listener. */
export function onProviderUsage(next: Listener | undefined): void {
  listener = next;
}

export function reportUsage(usage: ProviderUsage): void {
  try {
    listener?.(usage);
  } catch {
    // Monitoring must not break a consultation.
  }
}

interface Tokens {
  inputTokens?: number;
  outputTokens?: number;
}

/** Token counts from an Anthropic message or an OpenAI chat completion, where reported. */
export function tokensOf(body: unknown): Tokens {
  const usage = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== 'object') return {};
  const read = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        return Math.round(value);
    }
    return undefined;
  };
  const input = read('input_tokens', 'prompt_tokens');
  const output = read('output_tokens', 'completion_tokens');
  return {
    ...(input === undefined ? {} : { inputTokens: input }),
    ...(output === undefined ? {} : { outputTokens: output }),
  };
}

/** Run one paid call and report it, whether it succeeds or throws. The outcome is unchanged. */
export async function metered<T>(
  call: Pick<ProviderUsage, 'provider' | 'operation' | 'model'>,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    reportUsage({ ...call, outcome: 'ok', durationMs: Date.now() - started, ...tokensOf(result) });
    return result;
  } catch (error) {
    reportUsage({
      ...call,
      outcome: 'error',
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.name : 'Error',
    });
    throw error;
  }
}
