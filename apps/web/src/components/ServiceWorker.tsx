'use client';

import { useEffect } from 'react';

/**
 * Registers the app-shell worker so the studio is installable (TASK-0042).
 *
 * Production only: in development Next serves modules it rewrites on every edit, and a worker
 * holding copies of them turns a normal edit into a stale-asset hunt.
 */
export function ServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
