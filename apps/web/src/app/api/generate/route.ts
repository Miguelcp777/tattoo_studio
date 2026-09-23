import { NextResponse } from 'next/server';
import { validateAgainst, type StudioJob } from '@tattoo/contracts';
import {
  errorResponse,
  input,
  reply,
  RequestError,
  session,
  worker,
  referenceBytes,
  catalogueBytes,
  isCatalogueSource,
  jobStatus,
} from '../../../lib/studio-server';
export async function POST(request: Request): Promise<NextResponse> {
  let current: ReturnType<typeof session> | undefined;
  let locked = false;
  try {
    const body = await input(request);
    current = session(request);
    if (current.busy) throw new RequestError('Espera a que termine la operación anterior.', 409);
    current.busy = true;
    locked = true;
    if (body['adult'] !== true || body['consent'] !== true)
      throw new RequestError(
        'Confirma la mayoría de edad y el permiso para procesar las imágenes.',
        422,
      );
    if (
      typeof body['idempotencyKey'] !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(body['idempotencyKey'])
    )
      throw new RequestError('Identificador de solicitud inválido.', 422);
    if (body['edit']) {
      const response = await worker(current.state.sessionId, '/jobs', 'POST', {
        edit: body['edit'],
        idempotencyKey: body['idempotencyKey'],
        referencesReviewed: true,
      });
      const status = await jobStatus(response);
      current.jobId = status.jobId;
      return reply(status, current, 202);
    }
    if (!current.state.brief || current.state.phase !== 'ready_to_generate')
      throw new RequestError('Completa el brief y sus medidas antes de generar.', 422);
    if (body['referencesReviewed'] !== true)
      throw new RequestError('Revisa las referencias antes de continuar.', 422);
    const referenceIds: string[] = [];
    for (const reference of current.state.references) {
      if (!reference.assetId) {
        const res = await worker(current.state.sessionId, '/media', 'POST', {
          data: isCatalogueSource(reference.source)
            ? await catalogueBytes(reference.source)
            : await referenceBytes(reference.source),
          kind: 'reference',
          consent: body['consent'] === true,
          adult: body['adult'] === true,
        });
        reference.assetId = (await res.json()).assetId;
      }
      if (reference.assetId) referenceIds.push(reference.assetId);
    }
    const payload = {
      brief: current.state.brief,
      referenceIds,
      idempotencyKey: body['idempotencyKey'],
      referencesReviewed: true,
      ...(body['bodyPhotoId'] ? { bodyPhotoId: body['bodyPhotoId'] } : {}),
      ...(body['placement'] ? { placement: body['placement'] } : {}),
    };
    const validated = validateAgainst<StudioJob>('studio-job', payload);
    if (!validated.valid)
      throw new RequestError('Revisa las referencias, la posición y las medidas.', 422);
    const response = await worker(current.state.sessionId, '/jobs', 'POST', validated.value);
    const status = await jobStatus(response);
    current.jobId = status.jobId;
    return reply(status, current, 202);
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (current && locked) current.busy = false;
  }
}
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const current = session(request);
    if (new URL(request.url).searchParams.get('history') === 'true') {
      const response = await worker(current.state.sessionId, '/jobs');
      const items = await response.json();
      if (!Array.isArray(items)) throw new RequestError('Historial no disponible.', 502);
      const history = items.map((item) => {
        const checked = validateAgainst('studio-status', item);
        if (!checked.valid) throw new RequestError('Historial inválido.', 502);
        return checked.value;
      });
      return reply(history, current);
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new RequestError('Trabajo inválido.');
    return reply(await jobStatus(await worker(current.state.sessionId, `/jobs/${id}`)), current);
  } catch (error) {
    return errorResponse(error);
  }
}
