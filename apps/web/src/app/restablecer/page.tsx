'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { Brand } from '@/components/Brand';
import { messageForError, messageForResponse } from '@/lib/client-errors';

/**
 * Choose a new password from a recovery link (TASK-0081, audit UX-04). Supabase returns here with
 * the token in the address fragment, which never reaches a server log; it is sent once, to our own
 * route, and the fragment is cleared from the address bar.
 */
export default function ResetPage(): ReactNode {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const found = fragment.get('access_token') ?? '';
    setToken(found);
    if (!found)
      setError(
        fragment.get('error_description') ??
          'Este enlace no es válido. Pide otro desde «¿Has olvidado tu contraseña?».',
      );
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, password }),
      });
      if (!response.ok)
        setError(messageForResponse(response.status, await response.json().catch(() => ({}))));
      else setDone(true);
    } catch (failure) {
      setError(messageForError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <form onSubmit={submit}>
        <Brand variant="card" />
        <h1>Elige una contraseña nueva</h1>
        {done ? (
          <p className="sign-in-note" role="status">
            Contraseña cambiada. Ya puedes <a href="/entrar">entrar con ella</a>.
          </p>
        ) : (
          <>
            {error && (
              <p className="sign-in-error" role="alert">
                {error}
              </p>
            )}
            <label htmlFor="password">Contraseña nueva (mínimo 8 caracteres)</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy || !token}
            />
            <label htmlFor="repeat">Repite la contraseña</label>
            <input
              id="repeat"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              disabled={busy || !token}
            />
            <button type="submit" disabled={busy || !token || password.length < 8 || !repeat}>
              {busy ? 'Guardando…' : 'Guardar la contraseña'}
            </button>
          </>
        )}
        <p className="sign-in-legal">
          <a href="/entrar">Volver a entrar</a>
        </p>
      </form>
    </main>
  );
}
