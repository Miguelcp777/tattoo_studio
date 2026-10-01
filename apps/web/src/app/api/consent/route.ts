import { NextResponse } from 'next/server';

import { acceptsCurrent, setConsentCookie } from '../../../lib/consent';
import { report } from '../../../lib/telemetry';
import {
  applyRenewal,
  errorResponse,
  input,
  requireAccount,
  RequestError,
} from '../../../lib/studio-server';
import { IMAGES_VERSION, TERMS_VERSION } from '../../../content/legal';

/**
 * Accept the terms and image consent for a session that is already open (TASK-0064, ADR-0028):
 * one that began before sign-in consent existed, or one whose texts have since changed version.
 * A new sign-in does this in `/api/auth`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const caller = await requireAccount(request);
    const body = await input(request);
    if (!acceptsCurrent(body['accepted']))
      throw new RequestError('Acepta las condiciones y el uso de tus imágenes para continuar.');
    report(
      {
        kind: 'sign_in',
        operation: 'consent',
        detail: { terms: TERMS_VERSION, images: IMAGES_VERSION },
      },
      caller.account.id,
    );
    return applyRenewal(
      setConsentCookie(
        NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }),
        caller.account.id,
      ),
      caller,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
