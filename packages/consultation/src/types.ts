import type { BodyPart, StyleName, TattooBrief } from '@tattoo/contracts';

/** Supported image MIME types for visual references */
export type ReferenceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** User-supplied visual reference (sketch, photo, motif example) */
export interface ReferenceImage {
  /** Public HTTPS URL or base64 data URL */
  source: string;
  assetId?: string;
  sourcePage?: string;
  referenceQuery?: string;
  license?: string;
  retrievedAt?: string;
  verification?: 'candidate' | 'user_supplied';
  mimeType: ReferenceImageMimeType;
  /** Optional caption or user label describing what they like about this reference */
  label?: string | undefined;
}

/** A single conversation turn */
export interface ConsultationTurn {
  role: 'user' | 'assistant';
  content: string;
  referenceImages?: ReferenceImage[] | undefined;
  timestamp: string;
}

/** Partially extracted slots progressing towards a full TattooBrief */
export interface ConsultationSlots {
  subject?:
    | {
        description?: string | undefined;
        elements?: string[] | undefined;
      }
    | undefined;
  style?:
    | {
        primary?: StyleName | undefined;
        secondary?: StyleName | undefined;
        notes?: string | undefined;
      }
    | undefined;
  linework?:
    | {
        weight?: 'fine' | 'medium' | 'bold' | 'mixed' | undefined;
        notes?: string | undefined;
      }
    | undefined;
  shading?:
    | {
        technique?:
          'none' | 'whip' | 'dotwork' | 'smooth_blend' | 'solid_fill' | 'mixed' | undefined;
        intensity?: 'light' | 'medium' | 'heavy' | undefined;
      }
    | undefined;
  colour?:
    | {
        mode?: 'black_and_grey' | 'colour' | 'black_and_grey_with_accent' | undefined;
        palette?: string[] | undefined;
      }
    | undefined;
  placement?:
    | {
        bodyPart?: BodyPart | undefined;
        orientation?: 'vertical' | 'horizontal' | 'diagonal' | 'wrapping' | undefined;
        side?: 'left' | 'right' | 'centre' | undefined;
      }
    | undefined;
  size?:
    | {
        widthMm?: number | undefined;
        heightMm?: number | undefined;
      }
    | undefined;
  constraints?:
    | {
        coverUp?: boolean | undefined;
        avoid?: string[] | undefined;
      }
    | undefined;
}

export type ConsultationStatus = 'active' | 'complete' | 'refused_mimicry';

/** The complete state of an in-progress or finished consultation */
export interface ConsultationState {
  sessionId: string;
  revision: number;
  status: ConsultationStatus;
  turns: ConsultationTurn[];
  slots: ConsultationSlots;
  nextQuestion: string;
  clarificationMessage?: string | undefined;
  readyForGeneration?: boolean | undefined;
}

/** Incomplete brief status return */
export interface IncompleteBrief {
  complete: false;
  missingSlots: string[];
  state: ConsultationState;
}

/** Complete brief status return */
export interface CompleteBrief {
  complete: true;
  brief: TattooBrief;
}

export type BriefExtractionResult = CompleteBrief | IncompleteBrief;
