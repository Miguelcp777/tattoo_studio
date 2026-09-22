import type { BodyPart, StyleName } from '@tattoo/contracts';
import type { ConsultationSlots } from '../types';

const normal = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export const STYLE_OPTIONS: Record<StyleName, string> = {
  american_traditional: 'Tradicional americano',
  fine_line: 'Línea fina',
  black_and_grey_realism: 'Realismo',
  neo_traditional: 'Neotradicional',
  irezumi: 'Irezumi',
  blackwork: 'Blackwork',
  illustrative: 'Ilustrativo',
  ornamental: 'Ornamental',
  lettering: 'Lettering',
  surrealism: 'Surrealismo',
};
export const BODY_OPTIONS: Partial<Record<BodyPart, string>> = {
  inner_forearm: 'Antebrazo interior',
  outer_forearm: 'Antebrazo exterior',
  upper_arm_outer: 'Brazo',
  shoulder: 'Hombro',
  chest: 'Pecho',
  ribs: 'Costillas',
  stomach: 'Abdomen',
  upper_back: 'Espalda alta',
  lower_back: 'Espalda baja',
  thigh_front: 'Muslo',
  calf: 'Gemelo',
  ankle: 'Tobillo',
  wrist_inner: 'Muñeca',
  hand: 'Mano',
  neck: 'Cuello',
  foot: 'Pie',
};

/** Extract only explicit preferences. Technical defaults are visible in the brief. */
export function extractPreferences(input: string, existing: ConsultationSlots): ConsultationSlots {
  const text = normal(input);
  const slots: ConsultationSlots = structuredClone(existing);
  if (!slots.subject?.description) slots.subject = { description: input.trim() };
  else if (/^(cambia el tema|nuevo tema|anade|añade|incluye|tambien quiero)/i.test(input)) {
    slots.subject.description = /^(cambia el tema|nuevo tema)/i.test(input)
      ? input.replace(/^[^:]+:\s*/, '')
      : `${slots.subject.description}. ${input}`;
  }
  const styles: [RegExp, StyleName][] = [
    [/linea fina|fine.?line/, 'fine_line'],
    [/neo.?tradicional|neo.?traditional/, 'neo_traditional'],
    [/tradicional|traditional/, 'american_traditional'],
    [/realismo|realista|realism/, 'black_and_grey_realism'],
    [/irezumi|japones|japanese/, 'irezumi'],
    [/blackwork/, 'blackwork'],
    [/ornamental/, 'ornamental'],
    [/lettering|caligrafia/, 'lettering'],
    [/surrealis/, 'surrealism'],
    [/ilustrativ|illustrative/, 'illustrative'],
  ];
  for (const [pattern, style] of styles)
    if (pattern.test(text)) {
      slots.style = { primary: style };
      break;
    }
  const placements: [RegExp, BodyPart][] = [
    [/gemelo|pantorrilla|calf/, 'calf'],
    [/antebrazo exterior|outer forearm/, 'outer_forearm'],
    [/antebrazo|forearm/, 'inner_forearm'],
    [/espalda baja|lumbar|lower back/, 'lower_back'],
    [/espalda|back/, 'upper_back'],
    [/pecho|chest/, 'chest'],
    [/hombro|shoulder/, 'shoulder'],
    [/costilla|ribs/, 'ribs'],
    [/muslo|thigh/, 'thigh_front'],
    [/tobillo|ankle/, 'ankle'],
    [/muneca|wrist/, 'wrist_inner'],
    [/brazo|arm/, 'upper_arm_outer'],
    [/cuello|neck/, 'neck'],
  ];
  for (const [pattern, bodyPart] of placements)
    if (pattern.test(text)) {
      slots.placement = { ...slots.placement, bodyPart };
      break;
    }
  if (/izquierd|\bleft\b/.test(text)) slots.placement = { ...slots.placement, side: 'left' };
  else if (/derech|\bright\b/.test(text)) slots.placement = { ...slots.placement, side: 'right' };
  else if (/centrad|\bcentre\b/.test(text))
    slots.placement = { ...slots.placement, side: 'centre' };
  if (/horizontal/.test(text)) slots.placement = { ...slots.placement, orientation: 'horizontal' };
  else if (/vertical/.test(text)) slots.placement = { ...slots.placement, orientation: 'vertical' };
  if (/transicion|toques de color|accent/.test(text))
    slots.colour = { mode: 'black_and_grey_with_accent', palette: colours(text) };
  else if (/blanco y negro|solo negro|en negro|black and (grey|gray)|black only|b\/n/.test(text))
    slots.colour = { mode: 'black_and_grey' };
  else if (/\bcolor\b|colour/.test(text)) slots.colour = { mode: 'colour', palette: colours(text) };
  const size = text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)/);
  if (size)
    slots.size = {
      widthMm: Number(size[1]!.replace(',', '.')) * (size[3] === 'cm' ? 10 : 1),
      heightMm: Number(size[2]!.replace(',', '.')) * (size[3] === 'cm' ? 10 : 1),
    };
  if (slots.colour?.palette?.length === 0) delete slots.colour.palette;
  return slots;
}
function colours(text: string): string[] {
  const palette = ['rojo', 'azul', 'verde', 'amarillo', 'naranja', 'violeta', 'dorado'].filter(
    (c) => text.includes(c),
  );
  return palette.length ? palette : [];
}
export function missingPreferences(s: ConsultationSlots): string[] {
  const missing: string[] = [];
  if (!s.subject?.description) missing.push('tema');
  if (!s.placement?.bodyPart) missing.push('zona');
  if (!s.style?.primary) missing.push('estilo');
  if (!s.colour?.mode) missing.push('color');
  return missing;
}
export function withTechnicalDefaults(s: ConsultationSlots): ConsultationSlots {
  return {
    ...s,
    linework:
      s.linework && s.linework.notes !== 'Propuesta técnica ajustable por el tatuador'
        ? s.linework
        : {
            weight: s.style?.primary === 'fine_line' ? 'fine' : 'medium',
            notes: 'Propuesta técnica ajustable por el tatuador',
          },
    shading: s.shading ?? { technique: 'none', intensity: 'light' },
    placement: { ...s.placement, orientation: s.placement?.orientation ?? 'vertical' },
  };
}
