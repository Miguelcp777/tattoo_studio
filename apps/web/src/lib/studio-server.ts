import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { OrchestratorAgent, type OrchestrationSession } from '@tattoo/consultation';
import { validateAgainst, type StudioJobStatus } from '@tattoo/contracts';

interface Session {
  state: OrchestrationSession;
  touched: number;
  busy: boolean;
  bodyPhotoId?: string;
  jobId?: string;
}
const root = globalThis as typeof globalThis & { inkcraftSessions?: Map<string, Session> };
const sessions = (root.inkcraftSessions ??= new Map<string, Session>());
export const orchestrator = new OrchestratorAgent();
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function jobStatus(response: Response): Promise<StudioJobStatus> {
  const result = validateAgainst<StudioJobStatus>('studio-status', await response.json());
  if (!result.valid) throw new RequestError('El worker devolvió un estado inválido.', 502);
  return result.value;
}
export function session(request: Request, create = false): Session {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('inkcraft='))
    ?.slice(9);
  for (const [id, value] of sessions)
    if (Date.now() - value.touched > 86400000) sessions.delete(id);
  const current = cookie ? sessions.get(cookie) : undefined;
  if (current) {
    current.touched = Date.now();
    return current;
  }
  if (!create) throw new RequestError('La sesión ha caducado. Inicia una nueva consulta.', 401);
  if (sessions.size >= 1000) throw new RequestError('El servicio está ocupado.', 503);
  const fresh = {
    state: orchestrator.createSession(randomUUID()),
    touched: Date.now(),
    busy: false,
  };
  sessions.set(fresh.state.sessionId, fresh);
  return fresh;
}
export function clearSession(id: string): void {
  sessions.delete(id);
}
export function reply(value: unknown, current: Session, status = 200): NextResponse {
  const response = NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('inkcraft', current.state.sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 86400,
  });
  return response;
}
export async function input(request: Request, maxBytes = 15000): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== (request.headers.get('host') ?? new URL(request.url).host))
    throw new RequestError('Origen no permitido.', 403);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Falta el contenido de la solicitud.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new RequestError('La solicitud es demasiado grande.', 413);
    }
    chunks.push(value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch {
    throw new RequestError('JSON inválido.');
  }
}
export function errorResponse(error: unknown): NextResponse {
  return NextResponse.json(
    {
      error:
        error instanceof RequestError
          ? error.message
          : 'No se pudo completar la solicitud. Inténtalo de nuevo.',
    },
    { status: error instanceof RequestError ? error.status : 500 },
  );
}
/** Bounded server-side fetch of a search candidate; never accept arbitrary hosts/redirects. */
export async function referenceBytes(source: string): Promise<string> {
  const url = new URL(source);
  const officialCrest = url.href === 'https://www.valenciacf.com/svg/escudo.svg';
  if (
    url.protocol !== 'https:' ||
    (!officialCrest && !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)) ||
    url.username ||
    url.password ||
    url.port ||
    url.search
  )
    throw new RequestError('Referencia externa no permitida.', 422);
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'InkCraft/0.1 (reference research)' },
  });
  if (!response.ok || !response.body)
    throw new RequestError('No se puede descargar la referencia. Adjunta una imagen.', 422);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8000000) {
      await reader.cancel();
      throw new RequestError('La referencia supera 8 MB.', 422);
    }
    parts.push(value);
  }
  const data = Buffer.concat(parts);
  if (officialCrest) {
    const svg = data.toString('utf8');
    // This allowlisted vector is rasterized before moderation/storage. No external resources.
    if (
      !svg.includes('<svg') ||
      /<!DOCTYPE|<!ENTITY|<script|<image|<foreignObject|href\s*=|url\s*\(\s*[^#\s]/i.test(svg)
    )
      throw new RequestError('La referencia oficial tiene un formato no admitido.', 422);
    return (
      await sharp(data, { density: 300, limitInputPixels: 16000000 })
        .resize({ width: 1200, height: 1600, fit: 'inside' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer()
    ).toString('base64');
  }
  return data.toString('base64');
}
export async function worker(
  owner: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<Response> {
  const token = process.env['TATTOO_WORKER_TOKEN'];
  if (!token)
    throw new RequestError(
      'El worker de imágenes no está configurado. Ejecuta el inicio local del proyecto.',
      503,
    );
  let response: Response;
  try {
    response = await fetch(
      `${process.env['TATTOO_WORKER_URL'] ?? 'http://127.0.0.1:8000'}/studio${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Session-Id': owner,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(path === '/media' ? 180000 : 15000),
        cache: 'no-store',
      },
    );
  } catch {
    throw new RequestError('No se puede conectar con el worker. Comprueba que está iniciado.', 503);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new RequestError(
      typeof data.detail === 'string' ? data.detail : 'El worker rechazó la solicitud.',
      response.status,
    );
  }
  return response;
}
