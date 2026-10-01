/**
 * Browser defences for every response (TASK-0074, audit SEG-01).
 *
 * The audit found the public answer had no CSP, HSTS, nosniff, frame protection or referrer policy.
 * The enforced CSP is the minimum that cannot break the studio: no framing, no plugins, no foreign
 * base URL. The complete policy is sent as Report-Only first, as the audit advises, so what the
 * studio really loads (Google Fonts, reference thumbnails from several hosts, blob camera frames)
 * can be confirmed before it is enforced. Next's own inline bootstrap scripts are why it still
 * allows 'unsafe-inline' scripts; nonces are the next step.
 *
 * @param {boolean} production
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(production) {
  const report = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // References come from Wikimedia, Openverse, Brave and club sites; generated media is ours.
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The camera try-on (TASK-0050) needs the camera on this origin; nothing else is used.
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    {
      key: 'Content-Security-Policy',
      value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    },
    { key: 'Content-Security-Policy-Report-Only', value: report },
    // Only over HTTPS in production: a local http:// preview must not be pinned to HTTPS.
    ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  ];
}
