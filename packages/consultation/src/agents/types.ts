import type { StyleName, TattooBrief } from '@tattoo/contracts';
import type { ConsultationSlots, ReferenceImage } from '../types';
export type AgentRole = 'orchestrator' | 'image_scout' | 'prompt_architect' | 'visual_creator';
export interface MultiAgentMessage {
  sender: AgentRole;
  senderLabel: string;
  content: string;
  timestamp: string;
  referenceImages?: ReferenceImage[];
}
export interface StylePick {
  /** Catalogue identity, e.g. `tribal:maori`. */
  id: string;
  style: StyleName;
  /** Spanish label shown in the brief, e.g. "Tribal · Maorí". */
  label: string;
}
export interface OrchestrationSession {
  sessionId: string;
  revision: number;
  phase: 'investigation' | 'needs_details' | 'ready_to_generate';
  questionsAsked: number;
  maxQuestions: 3;
  slots: ConsultationSlots;
  references: ReferenceImage[];
  /**
   * The queries the scout actually searched for the current subject (TASK-0033). Missing
   * references are judged against this plan, which the Sonnet planner may word differently from
   * the deterministic queries. Absent, the deterministic queries apply.
   */
  referencePlan?: string[] | undefined;
  /** The planned queries whose absence blocks generation (TASK-0034). */
  essentialReferences?: string[] | undefined;
  /** Spanish label per planned query, for messages to the client (TASK-0034). */
  referenceLabels?: Record<string, string> | undefined;
  /**
   * The catalogue variant the client pointed at (TASK-0038, ADR-0017). It settles the style and
   * nothing else: it is not a reference, and its image never leaves the web app.
   */
  stylePick?: StylePick | undefined;
  messages: MultiAgentMessage[];
  brief?: TattooBrief;
  missingFields: string[];
}
