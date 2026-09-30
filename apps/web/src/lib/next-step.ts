/**
 * What stands between the client and "Generar diseño y plantilla", and the one next action
 * (TASK-0034).
 *
 * Generation needs several independent things — a complete brief, any essential reference, the brief
 * accepted, age and permission confirmed, references reviewed, no unsaved panel edits. The button
 * used to be disabled with no word about which. These pure functions name each blocker in order
 * and point at the section that clears it. They read the state the page already holds and decide
 * nothing (WEB-INV-001): the gates themselves are unchanged.
 */

export interface GateInput {
  hasSession: boolean;
  busy: boolean;
  activeJob: boolean;
  hasArtifact: boolean;
  unsaved: boolean;
  /** What the master brief still lacks, e.g. ["el tamaño"]. */
  briefMissing: string[];
  /** Labels of essential references still missing, e.g. ["el escudo del FC Barcelona"]. */
  missingReferences: string[];
  briefAccepted: boolean;
  adult: boolean;
  consent: boolean;
  referencesReviewed: boolean;
  /** The consultation says everything it needs is present. */
  phaseReady: boolean;
}

export interface Blocker {
  /** Section anchor suffix: `step-${step}`. */
  step: 'idea' | 'brief' | 'estilo' | 'referencias' | 'resumen' | 'permisos' | 'diseno';
  text: string;
}

export interface NextAction {
  title: string;
  detail: string;
  step?: Blocker['step'] | undefined;
}

const list = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

export function generationBlockers(g: GateInput): Blocker[] {
  const blockers: Blocker[] = [];
  if (g.unsaved)
    blockers.push({
      step: 'brief',
      text: 'Guarda los cambios del panel con «Guardar preferencias».',
    });
  if (g.briefMissing.length)
    blockers.push({ step: 'brief', text: `Indica ${list(g.briefMissing)} en el panel.` });
  if (g.missingReferences.length)
    blockers.push({
      step: 'referencias',
      text: `Añade una imagen de ${list(g.missingReferences)}.`,
    });
  if (!g.phaseReady && !blockers.length)
    blockers.push({ step: 'brief', text: 'Completa los datos pendientes del panel.' });
  if (!g.briefAccepted)
    blockers.push({ step: 'resumen', text: 'Lee el resumen y pulsa «Aceptar y continuar».' });
  if (!g.adult) blockers.push({ step: 'permisos', text: 'Marca «Soy mayor de 18 años».' });
  if (!g.consent)
    blockers.push({ step: 'permisos', text: 'Marca el permiso para procesar las imágenes.' });
  if (!g.referencesReviewed)
    blockers.push({
      step: 'permisos',
      text: 'Confirma que las referencias corresponden a tu idea.',
    });
  return blockers;
}

export function nextAction(g: GateInput): NextAction {
  if (!g.hasSession)
    return {
      title: 'Empieza por tu idea',
      detail:
        'Escribe en el chat qué quieres tatuarte. Si ya sabes la zona o el estilo, dilo también.',
      step: 'idea',
    };
  if (g.busy) return { title: 'Un momento…', detail: 'Estamos preparando la propuesta.' };
  if (g.activeJob)
    return {
      title: 'Generando tu diseño',
      detail: 'Puede tardar unos minutos. No cierres la página.',
    };
  if (g.hasArtifact)
    return {
      title: 'Tu diseño está listo',
      detail: 'Ábrelo para verlo sobre la piel y descargar la plantilla. Puedes pedir cambios.',
      step: 'diseno',
    };
  const first = generationBlockers(g)[0];
  if (first) return { title: 'Siguiente paso', detail: first.text, step: first.step };
  return {
    title: 'Todo listo',
    detail: 'Pulsa «Generar diseño y plantilla».',
    step: 'diseno',
  };
}
