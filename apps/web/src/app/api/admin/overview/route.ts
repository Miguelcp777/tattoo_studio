import { NextResponse } from 'next/server';

import {
  adminWorker,
  applyRenewal,
  errorResponse,
  requireAdmin,
} from '../../../../lib/studio-server';

/** The studio's metrics over the last `days` (TASK-0055). Administrators only. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const caller = await requireAdmin(request);
    const days = Math.min(
      Math.max(Number(new URL(request.url).searchParams.get('days')) || 30, 1),
      365,
    );
    const report = await (await adminWorker(caller.account.id, `/overview?days=${days}`)).json();
    return applyRenewal(
      NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } }),
      caller,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
