'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * "Hola, <name>" and a way out (TASK-0049).
 *
 * Signing out ends the session at Supabase and forgets the conversation in this browser, then
 * lands on the sign-in page with a full load so nothing from the studio survives in memory.
 */
export function SessionMenu(): ReactNode {
  const [name, setName] = useState('');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { account?: { displayName?: string } | null }) => {
        if (!cancelled && body.account?.displayName) setName(body.account.displayName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function leave(): Promise<void> {
    setLeaving(true);
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } finally {
      // Whatever the server said: staying on a page that thinks it is signed in is worse.
      window.location.replace('/entrar');
    }
  }

  return (
    <div className="session-menu">
      {name && (
        <span className="session-greeting">
          Hola, <strong>{name}</strong>
        </span>
      )}
      <button
        type="button"
        className="session-leave"
        onClick={() => void leave()}
        disabled={leaving}
      >
        {leaving ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  );
}
