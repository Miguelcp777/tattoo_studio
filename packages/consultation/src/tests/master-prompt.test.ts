import { describe, expect, it } from 'vitest';

import { buildMasterPrompt } from '../agents/master-prompt';
import type { ConsultationSlots, ReferenceImage } from '../types';

const full: ConsultationSlots = {
  subject: { description: 'Un lobo realista mirando de frente' },
  style: { primary: 'tribal' },
  placement: { bodyPart: 'calf', side: 'right', bodyType: 'masculine' },
  size: { widthMm: 140, heightMm: 380 },
  colour: { mode: 'black_and_grey' },
  linework: { weight: 'medium' },
};

const value = (slots: ConsultationSlots, refs: ReferenceImage[] = [], label: string) =>
  buildMasterPrompt(slots, refs).lines.find((l) => l.label === label)?.value;

const reference = (
  verification: ReferenceImage['verification'],
  query?: string,
): ReferenceImage => ({
  source: `https://example.test/${verification}.png`,
  mimeType: 'image/png',
  ...(verification ? { verification } : {}),
  ...(query ? { referenceQuery: query } : {}),
});

describe('master brief (TASK-0029)', () => {
  it('is complete only when nothing is outstanding', () => {
    const prompt = buildMasterPrompt(full);
    expect(prompt.missing).toEqual([]);
    expect(prompt.complete).toBe(true);
  });

  it('names what is still missing instead of quietly omitting it', () => {
    const prompt = buildMasterPrompt({ subject: { description: 'Un lobo' } });
    expect(prompt.complete).toBe(false);
    expect(prompt.missing).toContain('el estilo');
    expect(prompt.missing).toContain('la zona');
    expect(prompt.missing).toContain('el color');
  });

  it('does not report a missing size before the zone is known', () => {
    // A size without a zone is meaningless (ADR-0011), so it is not an outstanding answer.
    const prompt = buildMasterPrompt({ subject: { description: 'Un lobo' } });
    expect(prompt.missing).not.toContain('el tamaño');
  });

  it('marks a size that exactly fills the zone as proposed, not stated', () => {
    const line = buildMasterPrompt(full).lines.find((l) => l.label === 'Tamaño');
    expect(line?.value).toBe('140 × 380 mm');
    expect(line?.proposed).toBe(true);
  });

  it('treats a size the client chose as their own', () => {
    const slots = { ...full, size: { widthMm: 90, heightMm: 150 } };
    expect(buildMasterPrompt(slots).lines.find((l) => l.label === 'Tamaño')?.proposed).toBe(false);
  });

  it('shows the chosen catalogue variant, which is the most specific thing said', () => {
    const pick = { id: 'tribal:maori', style: 'tribal' as const, label: 'Tribal · Maorí' };
    expect(buildMasterPrompt(full, [], pick).lines.find((l) => l.label === 'Estilo')?.value).toBe(
      'Tribal · Maorí',
    );
    expect(value(full, [], 'Estilo')).toBe('Tribal');
  });

  it('ignores a pick from a style the client has moved away from', () => {
    const stale = {
      id: 'lettering:script',
      style: 'lettering' as const,
      label: 'Lettering · Script',
    };
    expect(buildMasterPrompt(full, [], stale).lines.find((l) => l.label === 'Estilo')?.value).toBe(
      'Tribal',
    );
  });

  it('counts references by where they came from; a style pick is not one (TASK-0038)', () => {
    const refs = [reference('user_supplied'), reference('user_supplied'), reference('candidate')];
    expect(value(full, refs, 'Referencias')).toBe('2 tuyas, 1 encontrada');
    const pick = { id: 'tribal:maori', style: 'tribal' as const, label: 'Tribal · Maorí' };
    expect(
      buildMasterPrompt(full, [], pick).lines.find((l) => l.label === 'Referencias')?.value,
    ).toBe('ninguna');
  });

  it('says which side of the body', () => {
    expect(value(full, [], 'Dónde')).toBe('Gemelo derecho');
  });

  it('marks the technical linework as a studio proposal', () => {
    expect(buildMasterPrompt(full).lines.find((l) => l.label === 'Trazo')?.proposed).toBe(true);
  });
});

describe('body sex of the generated plate (TASK-0041)', () => {
  it('is required before the brief is complete, and shown once chosen', () => {
    const noType = { bodyPart: full.placement!.bodyPart, side: full.placement!.side };
    const without = buildMasterPrompt({ ...full, placement: noType });
    expect(without.complete).toBe(false);
    expect(without.missing).toContain('el cuerpo (hombre o mujer)');
    const line = buildMasterPrompt(full).lines.find((l) => l.label === 'Cuerpo');
    expect(line?.value).toBe('Hombre');
    expect(
      buildMasterPrompt({ ...full, placement: { ...noType, bodyType: 'feminine' } }).lines.find(
        (l) => l.label === 'Cuerpo',
      )?.value,
    ).toBe('Mujer');
  });
});
