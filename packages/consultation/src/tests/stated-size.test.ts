import { describe, expect, it, vi } from 'vitest';

import {
  buildMasterPrompt,
  OrchestratorAgent,
  proposeSize,
  statedSize,
  VisualSearchAgent,
} from '../index';

const offlineScout = () =>
  new VisualSearchAgent(vi.fn(async () => Response.json({ query: { pages: {} } })) as typeof fetch);

describe('statedSize (TASK-0073, audit UX-01)', () => {
  it.each([
    ['15 x 30 cm', 150, 300],
    ['15x30cm', 150, 300],
    ['15cm x 30cm', 150, 300],
    ['15 por 30 cm', 150, 300],
    ['150 × 300 mm', 150, 300],
    ['12,5 x 20 cm', 125, 200],
    ['15 cm de ancho y 30 cm de alto', 150, 300],
    ['15 de ancho y 30 cm de alto', 150, 300],
    ['30 cm de alto y 15 cm de ancho', 150, 300],
    ['de alto 30 cm y de ancho 15', 150, 300],
    ['ancho 15,5 cm, altura 30', 155, 300],
    ['20 cm de largo y 8 cm de ancho', 80, 200],
  ])('reads «%s» as %i × %i mm', (text, widthMm, heightMm) => {
    expect(statedSize(text)).toEqual({ widthMm, heightMm });
  });

  it('keeps a single dimension as the only one stated', () => {
    expect(statedSize('que mida 30 cm de alto')).toEqual({ heightMm: 300, stated: 'height' });
    expect(statedSize('unos 12 cm de ancho')).toEqual({ widthMm: 120, stated: 'width' });
  });

  it('reads nothing without a unit or a measure', () => {
    expect(statedSize('15 de ancho y 30 de alto')).toBeUndefined();
    expect(statedSize('un lobo grande en el gemelo')).toBeUndefined();
  });
});

describe('a stated size reaches the summary unchanged (TASK-0073)', () => {
  it('the audit case: 15 cm de ancho y 30 cm de alto on the calf stays 150 × 300 mm', async () => {
    const o = new OrchestratorAgent(offlineScout());
    const session = await o.handleUserInteraction(
      o.createSession(),
      'Una rosa realista en negro con acentos de color, ocupando casi todo el gemelo derecho de ' +
        'un hombre, 15 cm de ancho y 30 cm de alto',
    );
    expect(session.slots.size).toEqual({ widthMm: 150, heightMm: 300 });
    const prompt = buildMasterPrompt(session.slots, session.references);
    const size = prompt.lines.find((line) => line.label === 'Tamaño');
    expect(size).toMatchObject({ value: '150 × 300 mm' });
    expect(size?.proposed).toBeFalsy();
  });

  it('one stated dimension stays the client’s; the other is proposed and labelled', async () => {
    const o = new OrchestratorAgent(offlineScout());
    const session = await o.handleUserInteraction(
      o.createSession(),
      'Un lobo en el gemelo derecho, en negro y gris, realismo, de 30 cm de alto',
    );
    expect(session.slots.size?.heightMm).toBe(300);
    expect(session.slots.size?.stated).toBe('height');
    expect(session.slots.size?.proposed).toBe(true);
    const size = buildMasterPrompt(session.slots, session.references).lines.find(
      (line) => line.label === 'Tamaño',
    );
    expect(size?.value).toContain('alto indicado por ti');
  });

  it('a changed zone re-proposes the other dimension but keeps the stated one', () => {
    const slots = proposeSize(
      {
        placement: { bodyPart: 'upper_back' },
        size: { heightMm: 300, widthMm: 120, proposed: true, stated: 'height' },
      },
      undefined,
      'calf',
    );
    expect(slots.size?.heightMm).toBe(300);
    expect(slots.size?.stated).toBe('height');
  });
});
