import { describe, expect, it } from 'vitest';

import { buildSteps, describeSize, type StepInput } from './steps';

const blank: StepInput = {
  hasIdea: false,
  hasBrief: false,
  referenceCount: 0,
  hasArtifact: false,
};

const state = (input: StepInput) =>
  Object.fromEntries(buildSteps(input).map((s) => [s.id, s.state]));

describe('buildSteps', () => {
  it('opens on the idea and leaves everything after it pending', () => {
    expect(state(blank)).toEqual({
      idea: 'current',
      brief: 'pending',
      referencias: 'pending',
      diseno: 'pending',
    });
  });

  it('advances only as far as the answers allow', () => {
    expect(state({ ...blank, hasIdea: true })).toMatchObject({
      idea: 'done',
      brief: 'current',
      referencias: 'pending',
    });
  });

  it('marks references optional and never blocks on them', () => {
    const steps = buildSteps({ ...blank, hasIdea: true, hasBrief: true });
    expect(steps.find((s) => s.id === 'referencias')?.optional).toBe(true);
    // TASK-0026/AC-003: the design step becomes reachable without a single reference.
    const cleared = state({ ...blank, hasIdea: true, hasBrief: true });
    expect(cleared.diseno).toBe('current');
  });

  it('has no permissions step: they are accepted at sign-in (TASK-0064)', () => {
    expect(buildSteps(blank).map((step) => step.id)).not.toContain('permisos');
  });

  it('never reports the design as ready before the brief is complete', () => {
    const steps = state({ ...blank, hasIdea: true });
    expect(steps.brief).toBe('current');
    expect(steps.diseno).toBe('pending');
  });

  it('shows the proposed size once the brief is complete (ADR-0010)', () => {
    const steps = buildSteps({
      ...blank,
      hasIdea: true,
      hasBrief: true,
      proposedSize: { widthMm: 140, heightMm: 380 },
    });
    expect(steps.find((s) => s.id === 'brief')?.hint).toBe('Listo · 140 x 380 mm');
  });

  it('says nothing about size when none has been proposed', () => {
    const steps = buildSteps({ ...blank, hasIdea: true, hasBrief: true });
    expect(steps.find((s) => s.id === 'brief')?.hint).toBe('Listo');
    expect(describeSize(undefined)).toBe('');
    expect(describeSize({ widthMm: 140 })).toBe('');
  });

  it('reports a generated design as done', () => {
    expect(state({ ...blank, hasIdea: true, hasBrief: true, hasArtifact: true }).diseno).toBe(
      'done',
    );
  });
});
