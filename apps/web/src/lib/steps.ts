/**
 * Step derivation for the guided rail (TASK-0026, ADR-0010).
 *
 * Kept pure and out of the component so it can be tested without a DOM, and so the rail's
 * conditions read the same values the panel gates on rather than a parallel notion of
 * readiness. The rail reports progress; it decides nothing (WEB-INV-001).
 */

import type { Step } from '@/components/StepFlow';

export interface StepInput {
  hasIdea: boolean;
  hasBrief: boolean;
  referenceCount: number;
  adult: boolean;
  consent: boolean;
  referencesReviewed: boolean;
  hasArtifact: boolean;
  /** Millimetres already proposed by the design process, if any. */
  proposedSize?: { widthMm?: number | undefined; heightMm?: number | undefined } | undefined;
}

function stateOf(done: boolean, active: boolean): Step['state'] {
  return done ? 'done' : active ? 'current' : 'pending';
}

export function describeSize(size: StepInput['proposedSize']): string {
  return size?.widthMm && size?.heightMm ? `${size.widthMm} x ${size.heightMm} mm` : '';
}

export function buildSteps(input: StepInput): Step[] {
  const permitted = input.adult && input.consent;
  const cleared = permitted && input.referencesReviewed;
  const readyToGenerate = input.hasBrief && cleared;
  const size = describeSize(input.proposedSize);

  return [
    {
      id: 'idea',
      label: 'Tu idea',
      hint: input.hasIdea ? 'Recogida' : 'Describe qué quieres tatuarte',
      state: stateOf(input.hasIdea, true),
    },
    {
      id: 'brief',
      label: 'Estilo, zona y color',
      hint: input.hasBrief ? (size ? `Listo · ${size}` : 'Listo') : 'Responde o ajusta el panel',
      state: stateOf(input.hasBrief, input.hasIdea),
    },
    {
      id: 'referencias',
      label: 'Referencias',
      hint: input.referenceCount
        ? `${input.referenceCount} en revisión`
        : 'Puedes adjuntar imágenes',
      state: stateOf(input.referenceCount > 0, input.hasBrief),
      optional: true,
    },
    {
      id: 'permisos',
      label: 'Permisos y revisión',
      hint: permitted
        ? input.referencesReviewed
          ? 'Confirmado'
          : 'Falta confirmar las referencias'
        : 'Edad y permiso de uso',
      state: stateOf(cleared, input.hasBrief),
    },
    {
      id: 'diseno',
      label: 'Diseño y plantilla',
      hint: input.hasArtifact
        ? 'Generado'
        : readyToGenerate
          ? 'Todo listo para generar'
          : 'Se activa al completar',
      state: stateOf(input.hasArtifact, readyToGenerate),
    },
  ];
}
