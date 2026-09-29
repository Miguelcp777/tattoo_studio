'use client';

/**
 * Sign in (TASK-0045, ADR-0021).
 *
 * There is no sign-up here on purpose: accounts are created by the studio owner in Supabase. A
 * studio that lets anyone register is a studio that lets anyone spend its generation credits.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { Brand } from '@/components/Brand';

export default function SignInPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Someone already signed in has no business on this page.
  useEffect(() => {
    void fetch('/api/auth', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { account?: { email?: string } | null }) => {
        if (body.account) window.location.replace('/');
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'No se ha podido iniciar sesión.');
        return;
      }
      // A full load, so the server sees the new cookies on the first request.
      window.location.replace('/');
    } catch {
      setError('No se ha podido contactar con el servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <form onSubmit={(event) => void submit(event)}>
        <Brand variant="card" />
        <h1>Entra al estudio</h1>
        <p className="sign-in-note">Las cuentas las crea el estudio. Si necesitas uno, pídelo.</p>

        {error && (
          <p className="sign-in-error" role="alert">
            {error}
          </p>
        )}

        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />

        <button type="submit" disabled={busy || !email || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
