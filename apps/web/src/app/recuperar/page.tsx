'use client';

import { useState, type FormEvent, type ReactNode } from 'react';

import { Brand } from '@/components/Brand';
import { messageForError, messageForResponse } from '@/lib/client-errors';

/** «¿Has olvidado tu contraseña?» (TASK-0081, audit UX-04). */
export default function RecoverPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok)
        setError(messageForResponse(response.status, await response.json().catch(() => ({}))));
      else setSent(true);
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
        <h1>Recuperar la contraseña</h1>
        {sent ? (
          <p className="sign-in-note" role="status">
            Si hay una cuenta con ese correo, te hemos enviado un enlace para elegir una contraseña
            nueva. Revisa también la carpeta de correo no deseado.
          </p>
        ) : (
          <>
            <p className="sign-in-note">
              Escribe el correo de tu cuenta y te enviaremos un enlace para elegir otra contraseña.
            </p>
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
            <button type="submit" disabled={busy || !email}>
              {busy ? 'Enviando…' : 'Enviar el enlace'}
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
