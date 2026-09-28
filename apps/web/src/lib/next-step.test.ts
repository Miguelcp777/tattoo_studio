import { describe, expect, it } from 'vitest';

import { generationBlockers, nextAction, type GateInput } from './next-step';

const ready: GateInput = {
  hasSession: true,
  busy: false,
  activeJob: false,
  hasArtifact: false,
  unsaved: false,
  briefMissing: [],
  missingReferences: [],
  noReferences: false,
  briefAccepted: true,
  adult: true,
  consent: true,
  referencesReviewed: true,
  phaseReady: true,
};

describe('generationBlockers (TASK-0034)', () => {
  it('names nothing when everything is in place', () => {
    expect(generationBlockers(ready)).toEqual([]);
    expect(nextAction(ready)).toMatchObject({ title: 'Todo listo', step: 'diseno' });
  });

  it('names every gate, in the order the client meets them', () => {
    const blocked = generationBlockers({
      ...ready,
      unsaved: true,
      briefMissing: ['el tamaño'],
      missingReferences: ['el escudo del FC Barcelona'],
      noReferences: true,
      briefAccepted: false,
      adult: false,
      consent: false,
      referencesReviewed: false,
      phaseReady: false,
    });
    expect(blocked.map((b) => b.step)).toEqual([
      'brief',
      'brief',
      'referencias',
      // TASK-0038: a missing reference is answered in «Referencias», not by a style pick.
      'referencias',
      'resumen',
      'permisos',
      'permisos',
      'permisos',
    ]);
    expect(blocked[1]?.text).toBe('Indica el tamaño en el panel.');
    expect(blocked[2]?.text).toContain('el escudo del FC Barcelona');
  });

  it('never leaves a not-ready consultation without a reason', () => {
    expect(generationBlockers({ ...ready, phaseReady: false })[0]).toEqual({
      step: 'brief',
      text: 'Completa los datos pendientes del panel.',
    });
  });

  it('joins several missing items in Spanish', () => {
    expect(
      generationBlockers({ ...ready, briefMissing: ['el estilo', 'la zona', 'el color'] })[0]?.text,
    ).toBe('Indica el estilo, la zona y el color en el panel.');
  });
});

describe('nextAction (TASK-0034)', () => {
  it('starts at the idea, then follows the first blocker', () => {
    expect(nextAction({ ...ready, hasSession: false }).step).toBe('idea');
    expect(nextAction({ ...ready, briefAccepted: false })).toEqual({
      title: 'Siguiente paso',
      detail: 'Lee el resumen y pulsa «Aceptar y continuar».',
      step: 'resumen',
    });
  });

  it('reports work in progress and a finished design before any blocker', () => {
    expect(nextAction({ ...ready, busy: true, adult: false }).title).toBe('Un momento…');
    expect(nextAction({ ...ready, activeJob: true }).title).toBe('Generando tu diseño');
    expect(nextAction({ ...ready, hasArtifact: true }).title).toBe('Tu diseño está listo');
  });
});
