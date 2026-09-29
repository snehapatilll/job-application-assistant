import type { Request } from 'express';
import { config } from '../config.js';
import { verifySessionToken } from '../services/authService.js';
import { findUserById } from '../repositories/userRepository.js';
import { unauthorized } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Gate for routes that need a signed-in user.
 *
 * Reads the session JWT from the httpOnly cookie, verifies the signature, then
 * confirms the user still exists. That second step costs one indexed lookup
 * but means a deleted account cannot keep using a token that has not expired.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const cookies: unknown = req.cookies;
  const token =
    typeof cookies === 'object' && cookies !== null && config.authCookieName in cookies
      ? (cookies as Record<string, unknown>)[config.authCookieName]
      : undefined;

  if (typeof token !== 'string' || token === '') {
    throw unauthorized();
  }

  const userId = verifySessionToken(token);

  const user = await findUserById(userId);
  if (user === null) {
    throw unauthorized('Session is invalid or has expired');
  }

  req.userId = user.id;
  next();
});

/**
 * Read the id set by `requireAuth`. Throwing rather than returning undefined
 * turns "route mounted without the middleware" into a loud failure instead of
 * a silent query against `user_id = undefined`.
 */
export function getUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new Error('getUserId() called on a route not protected by requireAuth');
  }
  return req.userId;
}
