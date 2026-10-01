import { describe, expect, it } from 'vitest';

import { IMAGE_FAILURE_TEXT, imageFailure } from './image-failure';

describe('why a result image did not load (TASK-0077, audit UX-05)', () => {
  it('blames the 24-hour expiry only for an image made on the client’s own photo', () => {
    expect(imageFailure(404, true)).toBe('photo_gone');
    expect(imageFailure(404, false)).toBe('unavailable');
    expect(imageFailure(410, true)).toBe('photo_gone');
  });

  it('never calls a dropped connection, a server error or a session a deleted photo', () => {
    expect(imageFailure(null, true)).toBe('retry');
    expect(imageFailure(500, true)).toBe('retry');
    expect(imageFailure(503, true)).toBe('retry');
    expect(imageFailure(401, true)).toBe('session');
    expect(IMAGE_FAILURE_TEXT.retry).not.toMatch(/borr/);
  });
});
