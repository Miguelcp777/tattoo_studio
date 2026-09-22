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
}

export interface ConsultationProvider {
  processTurn(
    turns: ConsultationTurn[],
    currentSlots?: ConsultationSlots,
  ): Promise<ProviderExtractionOutput>;
}
