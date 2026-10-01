import { createHmac, timingSafeEqual } from 'node:crypto';

import type { NextResponse } from 'next/server';

import { IMAGES_VERSION, TERMS_VERSION } from '../content/legal';

/**
 * The record, in this browser, that the signed-in account accepted the current terms and image
 * consent when it signed in (TASK-0064, ADR-0028).
 *
 * An httpOnly cookie holding the versions and an HMAC over them and the account id, so it cannot
 * be written by the page or carried to another account, and a new version of either text simply
 * stops matching. It lives as long as the session and is cleared on sign-out, so every sign-in
 * asks again. The durable evidence is the sign-in event, which records the versions accepted.
 */
const COOKIE = 'inkcraft_ok';

/** Status a route answers when consent is missing, so the page knows to ask for it. */
export const CONSENT_REQUIRED = 428;

export interface Accepted {
  terms: string;
  images: string;
}

function secret(): string | undefined {
  return process.env['TATTOO_CONSENT_SECRET'] || process.env['TATTOO_WORKER_TOKEN'] || undefined;
}

function signature(account: string, key: string): string {
  return createHmac('sha256', key)
    .update(`${TERMS_VERSION}|${IMAGES_VERSION}|${account}`)
    .digest('base64url');
}

/** Whether a request body accepted exactly the current versions of both texts. */
export function acceptsCurrent(value: unknown): value is Accepted {
  if (!value || typeof value !== 'object') return false;
  const { terms, images } = value as Record<string, unknown>;
  return terms === TERMS_VERSION && images === IMAGES_VERSION;
}

export function consentCookieValue(account: string): string | undefined {
  const key = secret();
  return key ? `${TERMS_VERSION}.${IMAGES_VERSION}.${signature(account, key)}` : undefined;
}

export function setConsentCookie(response: NextResponse, account: string): NextResponse {
  const value = consentCookieValue(account);
  if (value)
    response.cookies.set(COOKIE, value, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
      // As long as the refresh token: the session, not a day.
      maxAge: 60 * 60 * 24 * 30,
    });
  return response;
}

export function clearConsentCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}

function cookieOf(request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** True only for this account's cookie, for the current versions of both texts. */
export function hasConsent(request: Request, account: string): boolean {
  const expected = consentCookieValue(account);
  const presented = cookieOf(request);
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}
