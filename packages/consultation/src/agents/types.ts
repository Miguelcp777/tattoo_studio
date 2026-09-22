import type { TattooBrief } from '@tattoo/contracts';
import type { ConsultationSlots, ReferenceImage } from '../types';
export type AgentRole = 'orchestrator' | 'image_scout' | 'prompt_architect' | 'visual_creator';
export interface MultiAgentMessage {
  sender: AgentRole;
  senderLabel: string;
  content: string;
  timestamp: string;
  referenceImages?: ReferenceImage[];
}
export interface OrchestrationSession {
  sessionId: string;
  revision: number;
  phase: 'investigation' | 'needs_details' | 'ready_to_generate';
  questionsAsked: number;
  maxQuestions: 3;
  slots: ConsultationSlots;
  references: ReferenceImage[];
  messages: MultiAgentMessage[];
  brief?: TattooBrief;
  missingFields: string[];
}
