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
  const [admin, setAdmin] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { account?: { displayName?: string; admin?: boolean } | null }) => {
        if (cancelled) return;
        if (body.account?.displayName) setName(body.account.displayName);
        // TASK-0055: only a link; the panel's routes check the role themselves.
        setAdmin(body.account?.admin === true);
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
      {admin && (
        <a className="session-leave" href="/admin">
          Panel
        </a>
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
