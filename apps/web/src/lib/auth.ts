/**
 * Authentication against Supabase (TASK-0045, ADR-0021).
 *
 * The studio spends real money on every generation, so the question this module answers is not
 * "who are you" but "may this request spend". Two decisions shape it:
 *
 * - **Supabase is the authority on a token, not us.** We ask it who a token belongs to rather than
 *   verifying a signature locally. That keeps the JWT signing secret out of this deployment
 *   entirely and keeps token parsing — the part that goes subtly wrong — out of our code.
 * - **Tokens live in HttpOnly cookies, never in the page.** The browser holds them, JavaScript
 *   cannot read them, and the login exchange happens server side, so a script injected into the
 *   page has nothing to steal.
 *
 * Sign-up is deliberately absent. Accounts are created by the owner in Supabase; a studio that
 * lets anyone register is a studio that lets anyone spend.
 */

import type { NextResponse } from 'next/server';

/** Who a request belongs to. Only what the studio needs; no profile data is carried around. */
export interface Account {
  id: string;
  email: string | undefined;
  /** The name set on the account in Supabase, when there is one (TASK-0049). */
  name?: string | undefined;
  /**
   * An administrator of the studio (TASK-0055): `app_metadata.role` is `"admin"`. Only
   * `app_metadata` counts - it is written with Supabase's administrative access. `user_metadata`
   * is writable by the user with their own session, so a role there would let anyone promote
   * themselves.
   */
  admin?: boolean;
}

/**
 * What to call the person in a greeting (TASK-0049).
 *
 * The name set on the account when there is one; otherwise the part of the address before the @,
 * which is at least something they chose. Never the whole address: a greeting is on screen for
 * anyone looking over a shoulder.
 */
export function displayName(account: Pick<Account, 'email' | 'name'>): string {
  const named = account.name?.trim();
  if (named) return named.slice(0, 60);
  const local = account.email?.split('@')[0]?.trim();
  return local ? local.slice(0, 60) : 'de nuevo';
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** The access token, short-lived and refreshed transparently. */
const ACCESS = 'inkcraft_at';
/** The refresh token, which is the thing worth stealing, so it never leaves the server or cookie. */
const REFRESH = 'inkcraft_rt';

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * Supabase's address and public key. Absent configuration is a hard failure rather than an open
 * door: a studio that cannot check who is asking must refuse everyone (PLAT-INV-005).
 */
export function supabase(env: NodeJS.ProcessEnv = process.env): SupabaseConfig {
  const url = env['SUPABASE_URL']?.replace(/\/+$/, '');
  const key = env['SUPABASE_ANON_KEY'];
  if (!url || !key)
    throw new AuthError('La autenticación no está configurada en el servidor.', 503);
  return { url, key };
}

/** True when the deployment has authentication configured at all. */
export function authConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['SUPABASE_URL'] && env['SUPABASE_ANON_KEY']);
}

async function auth(
  path: string,
  init: RequestInit,
  config: SupabaseConfig = supabase(),
): Promise<Response> {
  return fetch(`${config.url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
}

/** Exchange credentials for tokens. The password never reaches anything but Supabase. */
export async function signIn(email: string, password: string): Promise<Tokens> {
  let response: Response;
  try {
    response = await auth('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new AuthError('No se puede contactar con el servicio de cuentas.', 503);
  }
  if (!response.ok) {
    // Deliberately the same message for an unknown address and a wrong password: distinguishing
    // them tells an attacker which addresses exist.
    throw new AuthError('Correo o contraseña incorrectos.', 401);
  }
  const body = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!body.access_token || !body.refresh_token)
    throw new AuthError('El servicio de cuentas devolvió una respuesta inesperada.', 502);
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/** Who this token belongs to, or null when it is expired, revoked or forged. */
export async function accountFor(accessToken: string): Promise<Account | null> {
  let response: Response;
  try {
    response = await auth('/user', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // A momentary outage must not be read as "authenticated".
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  if (!body.id) return null;
  const metadata = body.user_metadata ?? {};
  const name = [metadata['name'], metadata['full_name'], metadata['display_name']].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const admin = body.app_metadata?.['role'] === 'admin';
  return { id: body.id, email: body.email, name, ...(admin ? { admin } : {}) };
}

/**
 * End this session at Supabase too (TASK-0049), so the refresh token stops working rather than
 * merely being forgotten by this browser. Best effort: signing out locally must never fail because
 * the account service is unreachable, so errors are swallowed and the caller clears the cookies
 * regardless.
 */
export async function signOut(accessToken: string | undefined): Promise<void> {
  if (!accessToken || !authConfigured()) return;
  try {
    await auth('/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // The cookies are cleared either way; an unrevoked token expires on its own.
  }
}

/** The access token this request carries, if any. */
export function accessTokenOf(request: Request): string | undefined {
  return cookie(request, ACCESS);
}

/** A fresh pair from a refresh token, or null when it no longer works. */
export async function refresh(refreshToken: string): Promise<Tokens | null> {
  let response: Response;
  try {
    response = await auth('/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; refresh_token?: string };
  return body.access_token && body.refresh_token
    ? { accessToken: body.access_token, refreshToken: body.refresh_token }
    : null;
}

function cookie(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function hasSessionCookie(request: Request): boolean {
  return Boolean(cookie(request, ACCESS) ?? cookie(request, REFRESH));
}

export interface Authenticated {
  account: Account;
  /** Set when the access token was renewed and the response must carry the new cookies. */
  renewed?: Tokens;
}

/**
 * Identify the caller, renewing an expired access token when the refresh token still works.
 *
 * Returns the tokens to re-issue rather than writing them, so the caller decides what the response
 * looks like; forgetting to pass them costs a re-login, never a wrong identity.
 */
export async function authenticate(request: Request): Promise<Authenticated | null> {
  const access = cookie(request, ACCESS);
  if (access) {
    const found = await accountFor(access);
    if (found) return { account: found };
  }
  const refreshToken = cookie(request, REFRESH);
  if (!refreshToken) return null;
  const renewed = await refresh(refreshToken);
  if (!renewed) return null;
  const found = await accountFor(renewed.accessToken);
  return found ? { account: found, renewed } : null;
}

const SHARED = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env['NODE_ENV'] === 'production',
  path: '/',
} as const;

/** Write the session cookies. `maxAge` is generous: the refresh token is what keeps a login alive. */
export function setAuthCookies(response: NextResponse, tokens: Tokens): NextResponse {
  response.cookies.set(ACCESS, tokens.accessToken, { ...SHARED, maxAge: 3600 });
  response.cookies.set(REFRESH, tokens.refreshToken, { ...SHARED, maxAge: 60 * 60 * 24 * 30 });
  return response;
}

export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS, '', { ...SHARED, maxAge: 0 });
  response.cookies.set(REFRESH, '', { ...SHARED, maxAge: 0 });
  return response;
}
