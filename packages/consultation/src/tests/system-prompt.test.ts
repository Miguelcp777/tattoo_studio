import { describe, expect, it } from 'vitest';

import { CONSULTATION_SYSTEM_PROMPT } from '../index';

describe('the professional description describes the design, not the body (TASK-0090)', () => {
  it('rule 10 tells the architect to describe the design on paper, never the skin', () => {
    expect(CONSULTATION_SYSTEM_PROMPT).toContain('as it would be drawn on paper');
    expect(CONSULTATION_SYSTEM_PROMPT).toContain('never describe the body, the skin');
  });
});
