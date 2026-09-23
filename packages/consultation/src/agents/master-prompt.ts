/**
 * The master brief, shown to the client before anything is generated (TASK-0029, ADR-0013).
 *
 * The point is that the client confirms the studio understood them *before* money is spent and
 * before a design exists to be disappointed by.
 *
 * It is deliberately a reading of the brief rather than a second description of it. The worker
 * assembles the technical prompt from this same brief, so there is nothing here that can drift
 * away from what is actually sent: if a line is wrong, the tattoo would have been wrong too.
 */

import { BODY_ZONE_SPANS, STYLE_CATALOGUE } from '@tattoo/contracts';

import type { ConsultationSlots, ReferenceImage } from '../types';
import { BODY_OPTIONS, STYLE_OPTIONS } from './researcher';

export interface MasterPromptLine {
  label: string;
  value: string;
  /** True when the studio decided this rather than the client stating it. */
  proposed?: boolean;
}

export interface MasterPrompt {
  /** Every line is present; `complete` says whether it is safe to generate from. */
  lines: MasterPromptLine[];
  missing: string[];
  complete: boolean;
}

const COLOUR_LABELS: Record<string, string> = {
  black_and_grey: 'Negro y gris',
  colour: 'Color',
  black_and_grey_with_accent: 'Negro con acentos de color',
};

const WEIGHT_LABELS: Record<string, string> = {
  fine: 'fino',
  medium: 'medio',
  bold: 'grueso',
};

const SIDE_LABELS: Record<string, string> = {
  left: 'izquierdo',
  right: 'derecho',
  centre: 'centrado',
};

function styleLine(slots: ConsultationSlots, references: ReferenceImage[]): string {
  const primary = slots.style?.primary;
  if (!primary) return '';
  const label = STYLE_OPTIONS[primary] ?? primary;
  const pick = references.find((r) => r.verification === 'style_library');
  // The chosen variant is the most specific thing the client told us about the style.
  return pick?.referenceQuery ? `${label} · ${pick.referenceQuery.split(' · ').pop()}` : label;
}

function sizeLine(slots: ConsultationSlots): { value: string; proposed: boolean } {
  const size = slots.size;
  if (!size?.widthMm || !size?.heightMm) return { value: '', proposed: false };
  const zone = slots.placement?.bodyPart;
  const span = zone ? BODY_ZONE_SPANS[zone] : undefined;
  // A size that exactly fills the reference span was proposed by the studio, not measured.
  const fillsZone = Boolean(
    span &&
    Math.abs(size.widthMm - span.widthMm) < 1 &&
    Math.abs(size.heightMm - span.heightMm) < 1,
  );
  return { value: `${size.widthMm} × ${size.heightMm} mm`, proposed: fillsZone };
}

/**
 * Build the summary the client accepts.
 *
 * `missing` lists what still has no answer. A caller must not offer acceptance while it is
 * non-empty: accepting an incomplete brief would mean agreeing to decisions nobody has made.
 */
export function buildMasterPrompt(
  slots: ConsultationSlots,
  references: ReferenceImage[] = [],
): MasterPrompt {
  const missing: string[] = [];
  const lines: MasterPromptLine[] = [];

  const subject = slots.subject?.description?.trim();
  if (subject) lines.push({ label: 'Qué', value: subject });
  else missing.push('el tema');

  const style = styleLine(slots, references);
  if (style) lines.push({ label: 'Estilo', value: style });
  else missing.push('el estilo');

  const zone = slots.placement?.bodyPart;
  if (zone) {
    const side = slots.placement?.side;
    const label = BODY_OPTIONS[zone] ?? zone;
    lines.push({
      label: 'Dónde',
      value: side && SIDE_LABELS[side] ? `${label} ${SIDE_LABELS[side]}` : label,
    });
  } else missing.push('la zona');

  const size = sizeLine(slots);
  if (size.value) {
    lines.push({ label: 'Tamaño', value: size.value, proposed: size.proposed });
  } else if (zone) {
    // Only reportable once the zone is known; a size without one is meaningless (ADR-0011).
    missing.push('el tamaño');
  }

  const colour = slots.colour?.mode;
  if (colour) {
    const palette = slots.colour?.palette?.length ? ` (${slots.colour.palette.join(', ')})` : '';
    lines.push({ label: 'Color', value: `${COLOUR_LABELS[colour] ?? colour}${palette}` });
  } else missing.push('el color');

  const weight = slots.linework?.weight;
  if (weight)
    lines.push({
      label: 'Trazo',
      value: WEIGHT_LABELS[weight] ?? weight,
      proposed: true,
    });

  const own = references.filter((r) => r.verification === 'user_supplied').length;
  const found = references.filter((r) => r.verification === 'candidate').length;
  const catalogue = references.filter((r) => r.verification === 'style_library').length;
  const parts = [
    own ? `${own} tuya${own > 1 ? 's' : ''}` : '',
    found ? `${found} encontrada${found > 1 ? 's' : ''}` : '',
    catalogue ? `${catalogue} del catálogo` : '',
  ].filter(Boolean);
  lines.push({
    label: 'Referencias',
    value: parts.length ? parts.join(', ') : 'ninguna',
  });

  return { lines, missing, complete: missing.length === 0 };
}

/** Styles the catalogue knows, for callers that want to show what a style means. */
export function catalogueHas(style: string | undefined): boolean {
  return Boolean(style && style in STYLE_CATALOGUE);
}
