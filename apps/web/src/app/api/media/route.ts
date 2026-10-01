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
  requireConsent,
  worker,
} from '../../../lib/studio-server';

export async function POST(request: Request): Promise<NextResponse> {
  let current: ReturnType<typeof session> | undefined;
  let locked = false;
  try {
    // TASK-0045: an upload is screened by a paid moderation call, so it needs an account too.
    const caller = await requireAccount(request);
    // TASK-0064: every upload is screened and stored under the consent given at sign-in.
    requireConsent(request, caller);
    const body = await input(request, 12000000);
    current = session(request, true, caller.account.id);
    carryRenewal(current, caller);
    if (current.busy) throw new RequestError('Espera a que termine la operación anterior.', 409);
    current.busy = true;
    locked = true;
    if (body['purpose'] === 'edit') {
      // TASK-0036: a photo for a change request on an existing design. It is screened and
      // stored like any reference, but does not reopen the consultation or its accepted brief.
      const data = await (
        await worker(caller.account.id, '/media', 'POST', {
          data: body['data'],
          kind: 'reference',
          adult: true,
          consent: true,
        })
      ).json();
      return reply(data, current);
    }
    if (body['kind'] === 'reference' && current.state.references.length >= 5)
      throw new RequestError('Máximo cinco referencias.');
    const data = await (
      await worker(caller.account.id, '/media', 'POST', { ...body, adult: true, consent: true })
    ).json();
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
    // Stored work is private to its owner; a media id is not a capability. TASK-0046: the owner
    // is the account, so an image opens on any device the account is signed in on, and needs no
    // consultation in progress.
    const caller = await requireAccount(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new RequestError('Archivo inválido.');
    const response = await worker(caller.account.id, `/media/${id}`);
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
/**
 * Erase everything this account has stored (TASK-0046).
 *
 * The worker now records when it happened rather than blocklisting the owner: with an account id
 * a blocklist would be a permanent lockout, and what it actually protected — work in flight being
 * written after the erasure — is protected by the timestamp instead (DEC-002). The consultation in
 * this browser goes too, because it refers to assets that no longer exist.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const caller = await requireAccount(request);
    await input(request);
    await worker(caller.account.id, '/session', 'DELETE');
    try {
      clearSession(session(request, false, caller.account.id).state.sessionId);
    } catch {
      // No consultation in this browser. The account's work is deleted either way.
    }
    const response = NextResponse.json({ deleted: true });
    response.cookies.delete('inkcraft');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
