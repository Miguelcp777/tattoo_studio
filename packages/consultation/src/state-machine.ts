import { randomUUID } from 'node:crypto';
import { validateTattooBrief } from '@tattoo/contracts';
import { FixtureConsultationProvider } from './providers/fixture-provider';
import type { ConsultationProvider } from './providers/types';
import type {
  BriefExtractionResult,
  ConsultationSlots,
  ConsultationState,
  ConsultationTurn,
  ReferenceImage,
} from './types';

export interface ConsultationOptions {
  provider?: ConsultationProvider;
}

/**
 * Merge newly extracted slots into existing cumulative slots.
 */
function mergeSlots(
  current: ConsultationSlots,
  extracted: Partial<ConsultationSlots>,
): ConsultationSlots {
  const merged: ConsultationSlots = { ...current };

  if (extracted.subject) {
    merged.subject = {
      description: extracted.subject.description ?? current.subject?.description,
      elements: extracted.subject.elements ?? current.subject?.elements,
    };
  }

  if (extracted.style) {
    merged.style = {
      primary: extracted.style.primary ?? current.style?.primary,
      secondary: extracted.style.secondary ?? current.style?.secondary,
      notes: extracted.style.notes ?? current.style?.notes,
    };
  }

  if (extracted.linework) {
    merged.linework = {
      weight: extracted.linework.weight ?? current.linework?.weight,
      notes: extracted.linework.notes ?? current.linework?.notes,
    };
  }

  if (extracted.shading) {
    merged.shading = {
      technique: extracted.shading.technique ?? current.shading?.technique,
      intensity: extracted.shading.intensity ?? current.shading?.intensity,
    };
  }

  if (extracted.colour) {
    merged.colour = {
      mode: extracted.colour.mode ?? current.colour?.mode,
      palette: extracted.colour.palette ?? current.colour?.palette,
    };
  }

  if (extracted.placement) {
    merged.placement = {
      bodyPart: extracted.placement.bodyPart ?? current.placement?.bodyPart,
      orientation: extracted.placement.orientation ?? current.placement?.orientation,
      side: extracted.placement.side ?? current.placement?.side,
    };
  }

  if (extracted.size) {
    merged.size = {
      widthMm: extracted.size.widthMm ?? current.size?.widthMm,
      heightMm: extracted.size.heightMm ?? current.size?.heightMm,
    };
  }

  if (extracted.constraints) {
    merged.constraints = {
      coverUp: extracted.constraints.coverUp ?? current.constraints?.coverUp,
      avoid: extracted.constraints.avoid ?? current.constraints?.avoid,
    };
  }

  return merged;
}

/**
 * Start a new consultation session from an initial concept and optional reference images.
 */
export async function start(
  idea: string,
  referenceImages?: ReferenceImage[],
  options: ConsultationOptions = {},
): Promise<ConsultationState> {
  const provider = options.provider ?? new FixtureConsultationProvider();
  const sessionId = randomUUID().toLowerCase();
  const timestamp = new Date().toISOString();

  const initialTurn: ConsultationTurn = {
    role: 'user',
    content: idea,
    referenceImages,
    timestamp,
  };

  const output = await provider.processTurn([initialTurn], {});
  const slots = mergeSlots({}, output.extractedSlots);

  const assistantTurn: ConsultationTurn = {
    role: 'assistant',
    content: output.assistantReply,
    timestamp: new Date().toISOString(),
  };

  const status = output.mimicryDetected ? 'refused_mimicry' : 'active';
  const readyForGeneration =
    Boolean(output.readyForGeneration) ||
    Boolean(
      status !== 'refused_mimicry' &&
      slots.subject?.description &&
      slots.style?.primary &&
      slots.placement?.bodyPart,
    );

  return {
    sessionId,
    revision: 1,
    status,
    turns: [initialTurn, assistantTurn],
    slots,
    nextQuestion: output.assistantReply,
    clarificationMessage: output.mimicryDetected?.explanation,
    readyForGeneration,
  };
}

/**
 * Advance an ongoing consultation session with a user message and optional reference photos.
 */
export async function advance(
  state: ConsultationState,
  userMessage: string,
  referenceImages?: ReferenceImage[],
  options: ConsultationOptions = {},
): Promise<ConsultationState> {
  const provider = options.provider ?? new FixtureConsultationProvider();
  const timestamp = new Date().toISOString();

  const userTurn: ConsultationTurn = {
    role: 'user',
    content: userMessage,
    referenceImages,
    timestamp,
  };

  const updatedTurns = [...state.turns, userTurn];
  const output = await provider.processTurn(updatedTurns, state.slots);
  const updatedSlots = mergeSlots(state.slots, output.extractedSlots);

  const assistantTurn: ConsultationTurn = {
    role: 'assistant',
    content: output.assistantReply,
    timestamp: new Date().toISOString(),
  };

  const status = output.mimicryDetected ? 'refused_mimicry' : state.status;
  const readyForGeneration =
    Boolean(output.readyForGeneration) ||
    Boolean(
      status !== 'refused_mimicry' &&
      updatedSlots.subject?.description &&
      updatedSlots.style?.primary &&
      updatedSlots.placement?.bodyPart,
    );

  return {
    sessionId: state.sessionId,
    revision: state.revision + 1,
    status,
    turns: [...updatedTurns, assistantTurn],
    slots: updatedSlots,
    nextQuestion: output.assistantReply,
    clarificationMessage: output.mimicryDetected?.explanation ?? state.clarificationMessage,
    readyForGeneration,
  };
}

/**
 * Check missing mandatory slots in the consultation state.
 */
export function findMissingSlots(slots: ConsultationSlots): string[] {
  const missing: string[] = [];

  if (!slots.subject?.description) missing.push('subject.description');
  if (!slots.style?.primary) missing.push('style.primary');
  if (!slots.linework?.weight) missing.push('linework.weight');
  if (!slots.shading?.technique) missing.push('shading.technique');
  if (!slots.shading?.intensity) missing.push('shading.intensity');
  if (!slots.colour?.mode) missing.push('colour.mode');
  if (!slots.placement?.bodyPart) missing.push('placement.bodyPart');
  if (!slots.placement?.orientation) missing.push('placement.orientation');
  if (slots.size?.widthMm === undefined) missing.push('size.widthMm');
  if (slots.size?.heightMm === undefined) missing.push('size.heightMm');

  return missing;
}

/**
 * Return a validated TattooBrief if complete, or an IncompleteBrief status.
 */
export function brief(state: ConsultationState): BriefExtractionResult {
  const missing = findMissingSlots(state.slots);
  if (missing.length > 0) {
    return {
      complete: false,
      missingSlots: missing,
      state,
    };
  }

  const s = state.slots;
  const candidateBrief = {
    schemaVersion: '1.0.0',
    briefId: state.sessionId,
    revision: state.revision,
    createdAt: new Date().toISOString(),
    subject: {
      description:
        s.subject!.description!.length < 10
          ? `Tatuaje: ${s.subject!.description!}`
          : s.subject!.description!,
      elements: s.subject?.elements,
    },
    style: {
      primary: s.style!.primary!,
      secondary: s.style?.secondary,
      notes: s.style?.notes,
    },
    linework: {
      weight: s.linework!.weight!,
      notes: s.linework?.notes,
    },
    shading: {
      technique: s.shading!.technique!,
      intensity: s.shading!.intensity!,
    },
    colour: {
      mode: s.colour!.mode!,
      palette: s.colour?.palette,
    },
    placement: {
      bodyPart: s.placement!.bodyPart!,
      orientation: s.placement!.orientation!,
      side: s.placement?.side,
    },
    size: {
      widthMm: s.size!.widthMm!,
      heightMm: s.size!.heightMm!,
    },
    constraints: s.constraints,
  };

  const validation = validateTattooBrief(candidateBrief);
  if (!validation.valid) {
    return {
      complete: false,
      missingSlots: validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      state,
    };
  }

  return {
    complete: true,
    brief: validation.value,
  };
}
