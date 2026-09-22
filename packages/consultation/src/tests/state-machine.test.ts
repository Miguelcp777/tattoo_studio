import { describe, expect, it } from 'vitest';
import { assertTattooBrief } from '@tattoo/contracts';
import {
  advance,
  brief,
  FixtureConsultationProvider,
  OpenAIAstraError,
  OpenAIAstraProvider,
  start,
} from '../index';
import type { ReferenceImage } from '../types';

describe('Consultation State Machine with GPT-6 Astra and Reference Images', () => {
  it('TASK-0003/AC-001: completes a brief that passes @tattoo/contracts validation', async () => {
    const provider = new FixtureConsultationProvider();

    // Start with traditional wolf concept
    const state = await start('I want a classic American traditional wolf tattoo', undefined, {
      provider,
    });
    expect(state.status).toBe('active');
    expect(state.slots.style?.primary).toBe('american_traditional');
    expect(state.turns).toHaveLength(2);

    // Check brief extraction
    const res = brief(state);
    expect(res.complete).toBe(true);
    if (!res.complete) throw new Error('Expected brief to be complete');

    // Authority check: contracts assertion passes
    const validated = assertTattooBrief(res.brief);
    expect(validated.style.primary).toBe('american_traditional');
    expect(validated.size.widthMm).toBe(100);
    expect(validated.size.heightMm).toBe(150);
  });

  it('TASK-0003/AC-002: extracts visual elements and style from multimodal reference images', async () => {
    const provider = new FixtureConsultationProvider();
    const referenceImage: ReferenceImage = {
      source: 'https://example.com/wabori_dragon_sketch.png',
      mimeType: 'image/png',
      label: 'vintage irezumi dragon master study',
    };

    const state = await start(
      'Looking for a traditional Japanese sleeve concept',
      [referenceImage],
      { provider },
    );

    expect(state.slots.style?.primary).toBe('irezumi');
    expect(state.slots.linework?.weight).toBe('bold');
    expect(state.slots.subject?.description).toContain('vintage irezumi dragon');
    expect(state.slots.placement?.bodyPart).toBe('outer_forearm');

    const res = brief(state);
    expect(res.complete).toBe(true);
    if (!res.complete) throw new Error('Expected brief to be complete');

    const validated = assertTattooBrief(res.brief);
    expect(validated.style.primary).toBe('irezumi');
    expect(validated.colour.mode).toBe('black_and_grey');
  });

  it('TASK-0003/AC-003: declines mimicry of named living artists (PROD-INV-004)', async () => {
    const provider = new FixtureConsultationProvider();

    const state = await start(
      'Can you do a portrait tattoo exactly in the style of Nikko Hurtado?',
      undefined,
      {
        provider,
      },
    );

    expect(state.status).toBe('refused_mimicry');
    expect(state.clarificationMessage).toContain('living artists');
    expect(state.slots.style?.primary).toBe('black_and_grey_realism');
    expect(state.nextQuestion).toContain('do not copy or imitate');
  });

  it('reports missing slots when brief is partially filled and advances on next turn', async () => {
    const provider = new FixtureConsultationProvider();

    // Ambiguous concept
    const state = await start('I want a tattoo with some abstract vibe', undefined, { provider });
    const res1 = brief(state);

    expect(res1.complete).toBe(false);
    if (res1.complete) throw new Error('Expected brief to be incomplete');
    expect(res1.missingSlots).toContain('style.primary');
    expect(res1.missingSlots).toContain('size.widthMm');

    // Advance turn with style clarification
    const advanced = await advance(state, 'Actually, make it an Irezumi dragon style', undefined, {
      provider,
    });
    expect(advanced.revision).toBe(2);
    expect(advanced.turns).toHaveLength(4);
    const res2 = brief(advanced);
    expect(res2.complete).toBe(true);
  });

  it('OpenAIAstraProvider throws typed error when credentials are not configured', async () => {
    const astra = new OpenAIAstraProvider({ apiKey: '' });
    await expect(astra.processTurn([], {})).rejects.toThrow(OpenAIAstraError);
  });
});
