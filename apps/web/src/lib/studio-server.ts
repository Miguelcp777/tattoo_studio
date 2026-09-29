import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import {
  ClaudeConsultationProvider,
  ClaudeReferenceJudge,
  ClaudeScoutQueryPlanner,
  OpenAIAstraProvider,
  OrchestratorAgent,
  VisualSearchAgent,
  type ConsultationProvider,
  type OrchestrationSession,
} from '@tattoo/consultation';
import { validateAgainst, type StudioJobStatus } from '@tattoo/contracts';

import {
  authConfigured,
  authenticate,
  setAuthCookies,
  type Account,
  type Authenticated,
  type Tokens,
} from './auth';

interface Session {
  /**
   * The account that started this consultation (TASK-0049). The consultation lives in the browser,
   * so without this a second person signing in on the same browser would be handed the first
   * person's conversation.
   */
  owner?: string;
  state: OrchestrationSession;
  touched: number;
  busy: boolean;
  bodyPhotoId?: string;
  jobId?: string;
  /** Signature of the brief the client accepted (TASK-0037). Stale as soon as the brief moves. */
  acceptedBrief?: string;
  /** Tokens renewed while identifying the caller, to be re-issued with the next reply (TASK-0045). */
  renewedAuth?: Tokens;
}
const root = globalThis as typeof globalThis & { inkcraftSessions?: Map<string, Session> };
const sessions = (root.inkcraftSessions ??= new Map<string, Session>());

export interface LiveAgentConfig {
  architect: 'claude' | 'openai' | undefined;
  scoutPlanner: boolean;
}

/**
 * Which model-backed agents the live consultation uses (TASK-0033). Opt-in only: a credential in
 * the environment enables nothing by itself, so a developer's key cannot make the test suite call a
 * paid API, and `fixture` (canned replies) is never used on the live route.
 */
export function liveAgentConfig(
  env: Record<string, string | undefined> = process.env,
): LiveAgentConfig {
  const backend = env['TATTOO_CONSULTATION_BACKEND'];
  return {
    architect: backend === 'claude' || backend === 'openai' ? backend : undefined,
    scoutPlanner: env['TATTOO_SCOUT_PLANNER'] === 'claude',
  };
}

export function buildOrchestrator(
  env: Record<string, string | undefined> = process.env,
): OrchestratorAgent {
  const config = liveAgentConfig(env);
  const architect: ConsultationProvider | undefined =
    config.architect === 'claude'
      ? new ClaudeConsultationProvider()
      : config.architect === 'openai'
        ? new OpenAIAstraProvider()
        : undefined;
  // TASK-0034: the Sonnet scout plans the searches and checks the images it found.
  const scout = new VisualSearchAgent(
    undefined,
    config.scoutPlanner
      ? { planner: new ClaudeScoutQueryPlanner(), judge: new ClaudeReferenceJudge() }
      : {},
  );
  return new OrchestratorAgent(scout, architect);
}

export const orchestrator = buildOrchestrator();
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
function consultationCookie(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('inkcraft='))
    ?.slice(9);
}

/**
 * The consultation in progress in this browser.
 *
 * `owner` is the signed-in account (TASK-0049). A consultation started by a different account is
 * treated as absent — never handed over — so the next person on a shared browser starts clean.
 */
export function session(request: Request, create = false, owner?: string): Session {
  const cookie = consultationCookie(request);
  for (const [id, value] of sessions)
    if (Date.now() - value.touched > 86400000) sessions.delete(id);
  const found = cookie ? sessions.get(cookie) : undefined;
  const current = found && (!owner || !found.owner || found.owner === owner) ? found : undefined;
  if (current) {
    current.touched = Date.now();
    if (owner && !current.owner) current.owner = owner;
    return current;
  }
  if (!create) throw new RequestError('La sesión ha caducado. Inicia una nueva consulta.', 401);
  if (sessions.size >= 1000) throw new RequestError('El servicio está ocupado.', 503);
  const fresh: Session = {
    ...(owner ? { owner } : {}),
    state: orchestrator.createSession(randomUUID()),
    touched: Date.now(),
    busy: false,
  };
  sessions.set(fresh.state.sessionId, fresh);
  return fresh;
}

/** Forget this browser's consultation, if it has one (sign-out, TASK-0049). */
export function forgetConsultation(request: Request): void {
  const cookie = consultationCookie(request);
  if (cookie) sessions.delete(cookie);
}
export function clearSession(id: string): void {
  sessions.delete(id);
}
/**
 * The account behind this request (TASK-0045, ADR-0021).
 *
 * Every route that can spend money or read stored work calls this first. An unconfigured
 * deployment refuses rather than opening: a studio that cannot tell who is asking must say no.
 */
export async function requireAccount(request: Request): Promise<Authenticated> {
  if (!authConfigured())
    throw new RequestError('La autenticación no está configurada en el servidor.', 503);
  const found = await authenticate(request);
  if (!found) throw new RequestError('Inicia sesión para continuar.', 401);
  return found;
}

/**
 * An administrator of the studio (TASK-0055). Checked with Supabase on every request, like any
 * account, and then against `app_metadata.role`; the header's link to the panel decides nothing.
 */
export async function requireAdmin(request: Request): Promise<Authenticated> {
  const caller = await requireAccount(request);
  if (!caller.account.admin)
    throw new RequestError('Esta sección es solo para administración.', 403);
  return caller;
}

/**
 * Ask the worker's administrator routes, as this administrator. The worker records every look in
 * the audit trail under this id; the body photographs it refuses to serve stay refused here.
 */
export async function adminWorker(admin: string, path: string): Promise<Response> {
  const token = process.env['TATTOO_WORKER_TOKEN'];
  if (!token) throw new RequestError('El worker no está configurado.', 503);
  let response: Response;
  try {
    response = await fetch(
      `${process.env['TATTOO_WORKER_URL'] ?? 'http://127.0.0.1:8000'}/studio/admin${path}`,
      {
        headers: { Authorization: `Bearer ${token}`, 'X-Admin-Id': admin },
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      },
    );
  } catch {
    throw new RequestError('No se puede conectar con el worker.', 503);
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

/** Re-issue renewed tokens on a response built outside `reply`. */
export function applyRenewal(response: NextResponse, caller: Authenticated): NextResponse {
  return caller.renewed ? setAuthCookies(response, caller.renewed) : response;
}

/** Remember tokens renewed during this request so the next reply re-issues them. */
export function carryRenewal(current: Session, caller: Authenticated): Account {
  if (caller.renewed) current.renewedAuth = caller.renewed;
  return caller.account;
}

export function reply(value: unknown, current: Session, status = 200): NextResponse {
  const response = NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (current.renewedAuth) {
    setAuthCookies(response, current.renewedAuth);
    delete current.renewedAuth;
  }
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
/**
 * Call the worker on behalf of an account (TASK-0046).
 *
 * `owner` is the account id, not the consultation session id. It is what the worker scopes every
 * stored asset, job and vector master by, so it is the reason the same person sees the same work
 * on a second device — and the reason one account can never reach another's.
 */
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
          'X-Owner-Id': owner,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        // Uploads and kept photos are screened by the moderation provider before they are stored.
        signal: AbortSignal.timeout(path === '/media' || path === '/captures' ? 180000 : 15000),
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
