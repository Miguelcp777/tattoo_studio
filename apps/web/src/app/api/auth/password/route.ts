import { NextResponse } from 'next/server';

import { AuthError, updatePassword } from '../../../../lib/auth';

/** A new password, with the token of a recovery link (TASK-0081, audit UX-04). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      throw new AuthError('Origen no permitido.', 403);
    const body = (await request.json().catch(() => null)) as {
      accessToken?: unknown;
      password?: unknown;
    } | null;
    const token = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!token || token.length > 4096)
      throw new AuthError(
        'El enlace no es válido. Pide otro desde «¿Has olvidado tu contraseña?».',
        400,
      );
    if (password.length < 8 || password.length > 128)
      throw new AuthError('La contraseña debe tener entre 8 y 128 caracteres.', 400);
    await updatePassword(token, password);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof AuthError;
    return NextResponse.json(
      {
        error: known ? error.message : 'No se ha podido cambiar la contraseña. Inténtalo de nuevo.',
      },
      { status: known ? error.status : 500 },
    );
  }
}
