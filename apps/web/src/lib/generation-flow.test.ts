import { describe, expect, it } from 'vitest';

import { buildMasterPrompt } from '@tattoo/consultation';

import { BODY_MISSING, missingBeyondDialogs, nextDialog } from './generation-flow';

describe('the pop-ups before generating (TASK-0064)', () => {
  it('asks to save first, then for the body, then always for the summary', () => {
    expect(nextDialog({ unsaved: true, briefMissing: [BODY_MISSING] })).toBe('save');
    expect(nextDialog({ unsaved: false, briefMissing: [BODY_MISSING] })).toBe('body');
    expect(nextDialog({ unsaved: false, briefMissing: [] })).toBe('confirm');
  });

  it('names the body exactly as the master brief reports it missing', () => {
    const prompt = buildMasterPrompt({
      subject: { description: 'Un murciélago' },
      style: { primary: 'biomechanical' },
      placement: { bodyPart: 'thigh_front', orientation: 'vertical' },
      colour: { mode: 'black_and_grey' },
      size: { widthMm: 100, heightMm: 150 },
    });
    expect(prompt.missing).toContain(BODY_MISSING);
    // The body no longer blocks the button: its pop-up answers it.
    expect(missingBeyondDialogs(prompt.missing)).toEqual([]);
  });
});
