import { NextResponse } from 'next/server';

import {
  AuthError,
  authenticate,
  clearAuthCookies,
  setAuthCookies,
  signIn,
} from '../../../lib/auth';

/** Who is signed in, for the login page to decide where to send the browser. */
export async function GET(request: Request): Promise<NextResponse> {
  const found = await authenticate(request);
  const response = NextResponse.json(
    { account: found ? { email: found.account.email } : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  return found?.renewed ? setAuthCookies(response, found.renewed) : response;
}

/** Sign in. The password crosses this route and goes nowhere but Supabase. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Same-origin only: a cross-site form must not be able to spend a visitor's session.
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      throw new AuthError('Origen no permitido.', 403);

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new AuthError('Solicitud inválida.', 400);
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password)
      throw new AuthError('Escribe tu correo y tu contraseña.', 400);
    if (email.length > 320 || password.length > 200)
      throw new AuthError('Solicitud inválida.', 400);

    const tokens = await signIn(email, password);
    return setAuthCookies(
      NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }),
      tokens,
    );
  } catch (error) {
    // Never echo the provider's message: it distinguishes an unknown address from a wrong password.
    const status = error instanceof AuthError ? error.status : 500;
    const message =
      error instanceof AuthError ? error.message : 'No se pudo completar la solicitud.';
    return NextResponse.json({ error: message }, { status });
  }
}

/** Sign out. Clearing the cookies is enough: without them nothing identifies the caller. */
export async function DELETE(): Promise<NextResponse> {
  return clearAuthCookies(NextResponse.json({ ok: true }));
}
