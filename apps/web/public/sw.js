/**
 * App-shell service worker (TASK-0042, ADR-0019).
 *
 * It exists so the studio is installable and its shell opens without a network, which is what the
 * camera try-on needs on a phone. It deliberately caches almost nothing:
 *
 * - **`/api/` is never cached and never intercepted.** Those responses are per-session, private and
 *   `no-store`: a consultation, a brief, a design. Keeping a copy in a shared cache would outlive
 *   the session and the client's deletion of it, which SEC-INV and ADR-0006 do not allow.
 * - Everything else is network-first with a cache fallback, so a deploy is never served stale.
 */

const CACHE = 'tattoo-shell-v1';
const SHELL = [
  '/',
  '/probar',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Session-private data: left entirely to the network, never stored.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy).catch(() => undefined));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
  );
});
