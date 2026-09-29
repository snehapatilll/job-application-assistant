import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { config, requireEnv, SESSION_DURATION_MS } from '../config.js';
import { unauthorized } from '../utils/httpError.js';

/**
 * bcrypt cost factor. 12 is the common 2020s default: slow enough to make
 * offline cracking expensive, fast enough (~250ms) for an interactive login.
 */
const BCRYPT_ROUNDS = 12;

/**
 * bcrypt silently ignores input beyond 72 bytes, which would make two long
 * passwords sharing a prefix interchangeable. The register route rejects
 * anything longer instead of letting it be truncated.
 */
export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/**
 * Sign a session token for a user.
 *
 * The JWT carries only the user id (as the standard `sub` claim) — no email,
 * no role, nothing that could go stale between issue and expiry. Everything
 * else is re-read from the database on each request.
 */
export function signSessionToken(userId: number): string {
  return jwt.sign({}, requireEnv('JWT_SECRET'), {
    subject: String(userId),
    expiresIn: SESSION_DURATION_MS / 1000,
  });
}

/**
 * Verify a session token and return the user id it identifies.
 * Throws a 401 for anything malformed, expired, or signed with another key.
 */
export function verifySessionToken(token: string): number {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, requireEnv('JWT_SECRET'));
  } catch {
    throw unauthorized('Session is invalid or has expired');
  }

  if (typeof payload === 'string' || payload.sub === undefined) {
    throw unauthorized('Session is invalid or has expired');
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw unauthorized('Session is invalid or has expired');
  }

  return userId;
}

/**
 * Options for the session cookie.
 *
 * - `httpOnly` keeps the token out of reach of any JavaScript on the page, so
 *   an XSS bug cannot exfiltrate it the way it could read localStorage.
 * - `sameSite: 'lax'` stops other sites from making authenticated POSTs to the
 *   API, which is what stands in for a CSRF token here.
 * - `secure` is off in development because the dev server is plain http on
 *   localhost; in production the cookie is HTTPS-only.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: SESSION_DURATION_MS,
  };
}
