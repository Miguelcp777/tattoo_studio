import { NextResponse } from 'next/server';

import {
  applyRenewal,
  errorResponse,
  input,
  jobStatus,
  requireAccount,
  requireConsent,
  RequestError,
  worker,
} from '../../../lib/studio-server';

/**
 * Keep a photograph from the camera try-on as a version of its design (TASK-0050, ADR-0022).
 *
 * The photograph is of the client's body. It needs an account (the worker screens it with a paid
 * moderation call), the adult image consent given at sign-in (TASK-0064), and a design of the
 * caller's own to belong to. The
 * worker gives it the own-photo path; nothing here or there sends it to an image model.
 *
 * No consultation is needed: the photo belongs to a stored design, which belongs to the account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const caller = await requireAccount(request);
    requireConsent(request, caller);
    const body = await input(request, 12000000);
    const parentJobId = body['parentJobId'];
    if (typeof parentJobId !== 'string' || !/^[a-f0-9]{32}$/.test(parentJobId))
      throw new RequestError('Abre la cámara desde tu diseño para poder guardar la foto.', 422);
    const idempotencyKey = body['idempotencyKey'];
    if (typeof idempotencyKey !== 'string' || !/^[a-f0-9-]{36}$/.test(idempotencyKey))
      throw new RequestError('Identificador de solicitud inválido.', 422);
    if (typeof body['data'] !== 'string' || body['data'].length === 0)
      throw new RequestError('Falta la foto.', 422);

    // Only the fields the worker needs: nothing else the client sent travels on.
    const status = await jobStatus(
      await worker(caller.account.id, '/captures', 'POST', {
        parentJobId,
        idempotencyKey,
        adult: true,
        consent: true,
        data: body['data'],
      }),
    );
    return applyRenewal(
      NextResponse.json(status, { status: 201, headers: { 'Cache-Control': 'no-store' } }),
      caller,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
