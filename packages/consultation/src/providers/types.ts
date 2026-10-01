import type { StyleName } from '@tattoo/contracts';
import type { ConsultationSlots, ConsultationTurn } from '../types';

export interface ProviderExtractionOutput {
  extractedSlots: Partial<ConsultationSlots>;
  assistantReply: string;
  readyForGeneration?: boolean | undefined;
  mimicryDetected?:
    | {
        artistName: string;
        suggestedStyle: StyleName;
        explanation: string;
      }
    | undefined;
  /** TASK-0070: set only when the idea asks for sexually explicit content (rule 11). */
  contentRefused?: { explanation: string } | undefined;
}

export interface ConsultationProvider {
  processTurn(
    turns: ConsultationTurn[],
    currentSlots?: ConsultationSlots,
  ): Promise<ProviderExtractionOutput>;
}
