import { NextResponse } from 'next/server';
import {
  carryRenewal,
  clearSession,
  errorResponse,
  input,
  orchestrator,
  reply,
  RequestError,
  session,
  requireAccount,
  worker,
} from '../../../lib/studio-server';

export async function POST(request: Request): Promise<NextResponse> {
  let current: ReturnType<typeof session> | undefined;
  let locked = false;
  try {
    // TASK-0045: an upload is screened by a paid moderation call, so it needs an account too.
    const caller = await requireAccount(request);
    const body = await input(request, 12000000);
    current = session(request, true);
    carryRenewal(current, caller);
    if (current.busy) throw new RequestError('Espera a que termine la operación anterior.', 409);
    current.busy = true;
    locked = true;
    if (body['purpose'] === 'edit') {
      // TASK-0036: a photo for a change request on an existing design. It is screened and
      // stored like any reference, but does not reopen the consultation or its accepted brief.
      const data = await (
        await worker(current.state.sessionId, '/media', 'POST', {
          data: body['data'],
          kind: 'reference',
          adult: body['adult'],
          consent: body['consent'],
        })
      ).json();
      return reply(data, current);
    }
    if (body['kind'] === 'reference' && current.state.references.length >= 5)
      throw new RequestError('Máximo cinco referencias.');
    const data = await (await worker(current.state.sessionId, '/media', 'POST', body)).json();
    if (body['kind'] === 'body') current.bodyPhotoId = data.assetId;
    if (body['kind'] === 'reference') {
      current.state = await orchestrator.handleUserInteraction(current.state, '', [
        {
          assetId: data.assetId,
          source: `/api/media?id=${data.assetId}`,
          mimeType: data.mimeType,
          label: 'Referencia adjunta',
          verification: 'user_supplied',
        },
      ]);
    }
    return reply({ ...data, session: current.state }, current);
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (current && locked) current.busy = false;
  }
}
export async function GET(request: Request): Promise<Response> {
  try {
    // Stored work is private to its owner; a media id is not a capability.
    await requireAccount(request);
    const current = session(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new RequestError('Archivo inválido.');
    const response = await worker(current.state.sessionId, `/media/${id}`);
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await requireAccount(request);
    await input(request);
    const current = session(request);
    await worker(current.state.sessionId, '/session', 'DELETE');
    clearSession(current.state.sessionId);
    const response = NextResponse.json({ deleted: true });
    response.cookies.delete('inkcraft');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
