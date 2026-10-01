import { NextResponse } from 'next/server';

import {
  accessTokenOf,
  accountFor,
  AuthError,
  authenticate,
  clearAuthCookies,
  displayName,
  setAuthCookies,
  signIn,
  signOut,
} from '../../../lib/auth';
import {
  acceptsCurrent,
  clearConsentCookie,
  hasConsent,
  setConsentCookie,
} from '../../../lib/consent';
import { forgetConsultation } from '../../../lib/studio-server';
import { IMAGES_VERSION, TERMS_VERSION } from '../../../content/legal';
import { report } from '../../../lib/telemetry';

/**
 * Who is signed in: for the login page to decide where to send the browser, and for the studio to
 * greet them (TASK-0049). The account id is not exposed; nothing on the page needs it.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const found = await authenticate(request);
  const response = NextResponse.json(
    {
      account: found
        ? {
            email: found.account.email,
            displayName: displayName(found.account),
            // TASK-0055: only decides whether the header offers the panel; the panel's own routes
            // check the role with Supabase on every request.
            ...(found.account.admin ? { admin: true } : {}),
            // TASK-0064: a session from before sign-in consent existed is asked for it once.
            consented: hasConsent(request, found.account.id),
          }
        : null,
    },
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
    const { email, password, accepted } = body as {
      email?: unknown;
      password?: unknown;
      accepted?: unknown;
    };
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password)
      throw new AuthError('Escribe tu correo y tu contraseña.', 400);
    if (email.length > 320 || password.length > 200)
      throw new AuthError('Solicitud inválida.', 400);
    // TASK-0064 (ADR-0028): nobody enters without accepting the current terms and image consent.
    // Checked before Supabase is asked anything.
    if (!acceptsCurrent(accepted))
      throw new AuthError('Acepta las condiciones y el uso de tus imágenes para entrar.', 400);

    let tokens;
    try {
      tokens = await signIn(email, password);
    } catch (error) {
      // TASK-0054: a refused sign-in is counted, with neither address nor account: recording
      // which addresses were tried would itself be a list of who has an account.
      report(
        {
          kind: 'sign_in',
          operation: 'password',
          outcome: error instanceof AuthError && error.status === 401 ? 'refused' : 'error',
        },
        null,
      );
      throw error;
    }
    const account = await accountFor(tokens.accessToken);
    // TASK-0055: the address, so the administrator can tell accounts apart. It sits in the text,
    // which erasing the account's data clears.
    if (account)
      report(
        {
          kind: 'sign_in',
          operation: 'password',
          ...(account.email ? { text: account.email } : {}),
          // TASK-0064: the evidence of what was accepted, and when (the event's own time).
          detail: { terms: TERMS_VERSION, images: IMAGES_VERSION },
        },
        account.id,
      );
    const response = setAuthCookies(
      NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }),
      tokens,
    );
    return account ? setConsentCookie(response, account.id) : response;
  } catch (error) {
    // Never echo the provider's message: it distinguishes an unknown address from a wrong password.
    const status = error instanceof AuthError ? error.status : 500;
    const message =
      error instanceof AuthError ? error.message : 'No se pudo completar la solicitud.';
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Sign out (TASK-0049). The session is ended at Supabase as well, so a copied refresh token stops
 * working instead of staying valid for its thirty days; the cookies are cleared whatever Supabase
 * answers, because signing out must never be the thing that fails.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  await signOut(accessTokenOf(request));
  // The conversation in this browser is the signed-out person's; the next one starts clean.
  forgetConsultation(request);
  const response = clearConsentCookie(clearAuthCookies(NextResponse.json({ ok: true })));
  response.cookies.delete('inkcraft');
  return response;
}
