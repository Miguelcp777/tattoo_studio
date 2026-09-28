import { describe, expect, it } from 'vitest';

import { cameraAvailable, cameraFailure } from './try-on';

describe('camera states (TASK-0042/AC-007)', () => {
  it('treats a refusal as the client saying no, and anything else as a failure', () => {
    expect(cameraFailure(new DOMException('no', 'NotAllowedError'))).toBe('denied');
    expect(cameraFailure(new DOMException('insecure', 'SecurityError'))).toBe('denied');
    expect(cameraFailure(new DOMException('busy', 'NotReadableError'))).toBe('failed');
    expect(cameraFailure({ name: 'NotAllowedError' })).toBe('denied');
    expect(cameraFailure(new Error('boom'))).toBe('failed');
    expect(cameraFailure(undefined)).toBe('failed');
  });

  it('knows when the browser offers no camera at all', () => {
    expect(cameraAvailable(undefined)).toBe(false);
    expect(cameraAvailable({} as MediaDevices)).toBe(false);
    expect(cameraAvailable({ getUserMedia: async () => null } as unknown as MediaDevices)).toBe(
      true,
    );
  });
});
