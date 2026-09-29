import {
  adminWorker,
  errorResponse,
  RequestError,
  requireAdmin,
} from '../../../../lib/studio-server';

/**
 * A design file of any account, for the administrator (TASK-0055). The worker refuses any file that
 * shows a body - a body photo, a kept camera photo, or what was composed on them - with 403.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new RequestError('Archivo inválido.');
    const response = await adminWorker(caller.account.id, `/media/${id}`);
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
