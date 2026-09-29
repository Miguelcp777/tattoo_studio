import { NextResponse } from 'next/server';

import {
  adminWorker,
  applyRenewal,
  errorResponse,
  RequestError,
  requireAdmin,
} from '../../../../../lib/studio-server';

const ACCOUNT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/**
 * One account's activity and designs (TASK-0055). Administrators only; the worker records the look.
 * Versions carry `adminHidden`: the files that show a body, which the panel does not request.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ account: string }> },
): Promise<NextResponse> {
  try {
    const caller = await requireAdmin(request);
    const { account } = await context.params;
    if (!ACCOUNT_ID.test(account)) throw new RequestError('Cuenta no encontrada.', 404);
    const days = Math.min(
      Math.max(Number(new URL(request.url).searchParams.get('days')) || 90, 1),
      365,
    );
    const found = await (
      await adminWorker(caller.account.id, `/accounts/${account}?days=${days}`)
    ).json();
    return applyRenewal(
      NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } }),
      caller,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
