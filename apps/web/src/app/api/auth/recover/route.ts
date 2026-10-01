import { NextResponse } from 'next/server';

import { AuthError, requestRecovery } from '../../../../lib/auth';

/**
 * «¿Has olvidado tu contraseña?» (TASK-0081, audit UX-04). Answers the same whether or not the
 * address has an account, so the page cannot be used to find out which addresses exist.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      throw new AuthError('Origen no permitido.', 403);
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320)
      throw new AuthError('Escribe un correo válido.', 400);
    await requestRecovery(email, `${new URL(request.url).origin}/restablecer`);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof AuthError;
    return NextResponse.json(
      { error: known ? error.message : 'No se ha podido enviar el enlace. Inténtalo de nuevo.' },
      { status: known ? error.status : 500 },
    );
  }
}
