import { describe, expect, it } from 'vitest';

import { securityHeaders } from '../../security-headers.mjs';

type Header = { key: string; value: string };
const byKey = (headers: Header[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe('security headers (TASK-0074, audit SEG-01)', () => {
  it('sends the browser defences the audit found missing', () => {
    const headers = byKey(securityHeaders(true));
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=31536000/);
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
  });

  it('keeps the camera for the try-on and nothing else', () => {
    expect(byKey(securityHeaders(true))['Permissions-Policy']).toBe(
      'camera=(self), microphone=(), geolocation=()',
    );
  });

  it('reports the full policy before enforcing it, allowing what the studio loads', () => {
    const report = byKey(securityHeaders(true))['Content-Security-Policy-Report-Only']!;
    expect(report).toContain('https://fonts.googleapis.com');
    expect(report).toContain('https://fonts.gstatic.com');
    expect(report).toContain("img-src 'self' data: blob: https:");
  });

  it('does not pin a local http preview to HTTPS', () => {
    expect(byKey(securityHeaders(false))['Strict-Transport-Security']).toBeUndefined();
  });
});
