/**
 * What stands between the client and "Generar diseño y plantilla", and the one next action
 * (TASK-0034).
 *
 * Generation needs a complete brief and any essential reference. The button used to be disabled
 * with no word about which. These pure functions name each blocker in order and point at the
 * section that clears it. They read the state the page already holds and decide nothing
 * (WEB-INV-001).
 *
 * TASK-0064: age and image consent are accepted at sign-in, and unsaved panel edits, the body and
 * the final acceptance are each asked in a pop-up when «Generar» is pressed (`generation-flow.ts`),
 * so none of them blocks the button any more.
 */

export interface GateInput {
  hasSession: boolean;
  busy: boolean;
  activeJob: boolean;
  hasArtifact: boolean;
  /** What the master brief still lacks, e.g. ["el tamaño"], without what a pop-up asks. */
  briefMissing: string[];
  /** Labels of essential references still missing, e.g. ["el escudo del FC Barcelona"]. */
  missingReferences: string[];
  /** The consultation says everything it needs is present. */
  phaseReady: boolean;
}

export interface Blocker {
  /** Section anchor suffix: `step-${step}`. */
  step: 'idea' | 'brief' | 'estilo' | 'referencias' | 'resumen' | 'diseno';
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
  if (g.briefMissing.length)
    blockers.push({ step: 'brief', text: `Indica ${list(g.briefMissing)} en el panel.` });
  if (g.missingReferences.length)
    blockers.push({
      step: 'referencias',
      text: `Añade una imagen de ${list(g.missingReferences)}.`,
    });
  if (!g.phaseReady && !blockers.length)
    blockers.push({ step: 'brief', text: 'Completa los datos pendientes del panel.' });
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
