import { ClaudeConsultationProvider } from './claude';
import { FixtureConsultationProvider } from './fixture-provider';
import { OpenAIAstraProvider } from './openai-astra';
import type { ConsultationProvider } from './types';

/**
 * Choose the reasoning backend by configuration, never by caller (TASK-0032, ADR-0015).
 *
 * Order: an explicit `backend` wins; then `TATTOO_CONSULTATION_BACKEND`; then a present credential
 * (Claude preferred, then OpenAI); finally the deterministic fixture, which is the offline/CI path
 * and requires no key.
 */
export type ConsultationBackend = 'claude' | 'openai' | 'fixture';

export function resolveConsultationBackend(explicit?: ConsultationBackend): ConsultationBackend {
  if (explicit) return explicit;
  const configured = process.env['TATTOO_CONSULTATION_BACKEND'] as ConsultationBackend | undefined;
  if (configured === 'claude' || configured === 'openai' || configured === 'fixture') {
    return configured;
  }
  if (process.env['ANTHROPIC_API_KEY']) return 'claude';
  if (process.env['OPENAI_API_KEY']) return 'openai';
  return 'fixture';
}

export function selectConsultationProvider(
  config: { backend?: ConsultationBackend } = {},
): ConsultationProvider {
  switch (resolveConsultationBackend(config.backend)) {
    case 'claude':
      return new ClaudeConsultationProvider();
    case 'openai':
      return new OpenAIAstraProvider();
    default:
      return new FixtureConsultationProvider();
  }
}
