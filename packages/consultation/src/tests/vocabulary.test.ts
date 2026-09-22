import { describe, expect, it } from 'vitest';

import { extractPreferences, qualitativeSize, STYLE_OPTIONS } from '../agents/researcher';

const from = (input: string) => extractPreferences(input, {});

describe('style vocabulary (TASK-0027)', () => {
  it('recognises the styles that were previously rejected', () => {
    expect(from('quiero un tatuaje tribal').style?.primary).toBe('tribal');
    expect(from('algo geometrico en el brazo').style?.primary).toBe('geometric');
    expect(from('un lobo en acuarela').style?.primary).toBe('watercolour');
    expect(from('estilo new school').style?.primary).toBe('new_school');
    expect(from('un retrato chicano').style?.primary).toBe('chicano');
    expect(from('una pieza biomecanica').style?.primary).toBe('biomechanical');
  });

  it('still recognises the original vocabulary', () => {
    expect(from('un retrato realista').style?.primary).toBe('black_and_grey_realism');
    expect(from('linea fina').style?.primary).toBe('fine_line');
  });

  it('gives every style a Spanish label', () => {
    for (const [name, label] of Object.entries(STYLE_OPTIONS)) {
      expect(label, name).toBeTruthy();
    }
  });
});

describe('qualitative size (TASK-0027)', () => {
  it('scales against the zone, because grande is not one size', () => {
    const wrist = qualitativeSize('un tatuaje grande', 'wrist_inner');
    const back = qualitativeSize('un tatuaje grande', 'upper_back');
    expect(wrist).toBeDefined();
    expect(back).toBeDefined();
    expect(back!.heightMm).toBeGreaterThan(wrist!.heightMm * 3);
  });

  it('orders small below medium below large', () => {
    const h = (t: string) => qualitativeSize(t, 'calf')!.heightMm;
    expect(h('pequeno')).toBeLessThan(h('mediano'));
    expect(h('mediano')).toBeLessThan(h('grande'));
    expect(h('grande')).toBe(380); // a large calf piece fills the reference span
  });

  it('says nothing when the zone is unknown', () => {
    expect(qualitativeSize('un tatuaje grande', undefined)).toBeUndefined();
  });

  it('says nothing when no qualitative word is present', () => {
    expect(qualitativeSize('un lobo realista', 'calf')).toBeUndefined();
  });

  it('lets an explicit measurement win over the qualitative word', () => {
    const slots = from('un tatuaje grande en el gemelo de 80x120 mm');
    expect(slots.size).toEqual({ widthMm: 80, heightMm: 120 });
  });

  it('resolves through the full extraction when a zone is named', () => {
    const slots = from('quiero un tribal grande en el gemelo');
    expect(slots.style?.primary).toBe('tribal');
    expect(slots.placement?.bodyPart).toBe('calf');
    expect(slots.size).toEqual({ widthMm: 140, heightMm: 380 });
  });
});
