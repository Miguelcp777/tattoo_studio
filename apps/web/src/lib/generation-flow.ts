/**
 * What «Generar diseño y plantilla» asks before it generates (TASK-0064, ADR-0028).
 *
 * One pop-up at a time, only the ones that apply, in this order: unsaved panel edits first (the
 * brief must be what the client sees), then the body when it is not known (it chooses the skin
 * plate), then always the summary to accept, which is what the server checks before generating.
 */

export type GenerationDialog = 'save' | 'body' | 'confirm';

/** How the master brief names a missing body, as `buildMasterPrompt` reports it. */
export const BODY_MISSING = 'el cuerpo (hombre o mujer)';

export function nextDialog(state: { unsaved: boolean; briefMissing: string[] }): GenerationDialog {
  if (state.unsaved) return 'save';
  if (state.briefMissing.includes(BODY_MISSING)) return 'body';
  return 'confirm';
}

/** What still blocks the button itself: everything missing except what a pop-up asks. */
export function missingBeyondDialogs(briefMissing: string[]): string[] {
  return briefMissing.filter((item) => item !== BODY_MISSING);
}
