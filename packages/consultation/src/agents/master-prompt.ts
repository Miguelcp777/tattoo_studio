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
import type { StylePick } from './types';

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
  mixed: 'mixto (grueso en contornos, fino en detalles)',
};

const SIDE_LABELS: Record<string, string> = {
  left: 'izquierdo',
  right: 'derecho',
  centre: 'centrado',
};

const BODY_TYPE_LABELS: Record<string, string> = {
  masculine: 'Hombre',
  feminine: 'Mujer',
};

function styleLine(slots: ConsultationSlots, pick: StylePick | undefined): string {
  const primary = slots.style?.primary;
  if (!primary) return '';
  // The chosen variant is the most specific thing the client told us about the style. A pick
  // from another style is stale (the style changed since) and says nothing about this one.
  return pick?.style === primary ? pick.label : (STYLE_OPTIONS[primary] ?? primary);
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
  // TASK-0034: a size the studio proposed (from the architect or the zone) says so.
  return {
    value: `${size.widthMm} × ${size.heightMm} mm`,
    proposed: fillsZone || size.proposed === true,
  };
}

const spanishList = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

/**
 * One line summarising what the studio has settled so far (TASK-0034), for the chat's closing
 * message: "Irezumi · Muslo · Color · 170 × 330 mm (propuesto)".
 */
export function proposalSummary(slots: ConsultationSlots): string {
  const parts: string[] = [];
  const style = slots.style?.primary;
  if (style) parts.push(STYLE_OPTIONS[style] ?? style);
  const zone = slots.placement?.bodyPart;
  if (zone) {
    const side = slots.placement?.side;
    const label = BODY_OPTIONS[zone] ?? zone;
    parts.push(side && SIDE_LABELS[side] ? `${label} ${SIDE_LABELS[side]}` : label);
  }
  const colour = slots.colour?.mode;
  if (colour) parts.push(COLOUR_LABELS[colour] ?? colour);
  const size = sizeLine(slots);
  if (size.value) parts.push(size.proposed ? `${size.value} (propuesto)` : size.value);
  return parts.join(' · ');
}

export { spanishList };

/**
 * What a client accepts, as one comparable value (TASK-0037).
 *
 * The client sends it with its acceptance and the server stores its own; both must come from this
 * function, or a correct acceptance could be refused and a stale one allowed.
 */
export function briefSignature(prompt: MasterPrompt): string {
  return JSON.stringify(prompt.lines);
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
  pick?: StylePick,
): MasterPrompt {
  const missing: string[] = [];
  const lines: MasterPromptLine[] = [];

  const subject = slots.subject?.description?.trim();
  if (subject) lines.push({ label: 'Qué', value: subject });
  else missing.push('el tema');

  const style = styleLine(slots, pick);
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

  // TASK-0041: the generated plate reads as a man's or a woman's body. Asked here (blocks
  // acceptance) rather than as a fourth chat question. Not needed once an own photo is the surface.
  const bodyType = slots.placement?.bodyType;
  if (bodyType) lines.push({ label: 'Cuerpo', value: BODY_TYPE_LABELS[bodyType] ?? bodyType });
  else missing.push('el cuerpo (hombre o mujer)');

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
  const parts = [
    own ? `${own} tuya${own > 1 ? 's' : ''}` : '',
    found ? `${found} encontrada${found > 1 ? 's' : ''}` : '',
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
