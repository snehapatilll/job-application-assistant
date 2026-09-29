import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import {
  MAX_PASSWORD_BYTES,
  hashPassword,
  sessionCookieOptions,
  signSessionToken,
  verifyPassword,
} from '../services/authService.js';
import {
  findUserByEmailWithHash,
  findUserById,
  insertUser,
  type PublicUser,
} from '../repositories/userRepository.js';
import { badRequest, unauthorized } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getUserId, requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

const MIN_PASSWORD_LENGTH = 8;

const credentialsSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address').max(255)),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    // bcrypt ignores bytes past 72, and multi-byte characters hit that limit
    // sooner than the character count suggests — so measure bytes, not length.
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
      `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    ),
});

/** Flatten Zod issues into a `{ field: message }` map for the client. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

function parseCredentials(body: unknown): { email: string; password: string } {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest('Please check the form and try again', fieldErrors(parsed.error));
  }
  return parsed.data;
}

/**
 * A bcrypt hash of a throwaway value, compared against when no user matches so
 * that a failed login costs the same time whether or not the email exists.
 * Without this, response timing alone reveals which emails are registered.
 * Computed once on first use rather than at import, to keep startup fast.
 */
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return decoyHash;
}

/** Issue the session cookie for a user and return the public user body. */
function startSession(res: Response, user: PublicUser): { user: PublicUser } {
  res.cookie(config.authCookieName, signSessionToken(user.id), sessionCookieOptions());
  return { user };
}

/**
 * POST /api/auth/register — create an account and sign the user straight in.
 *
 * Responds 409 if the email is taken. That does confirm an address is
 * registered, but there is no way to run a usable sign-up form without it.
 */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password } = parseCredentials(req.body);

    const user = await insertUser(email, await hashPassword(password));

    res.status(201).json(startSession(res, user));
  }),
);

/**
 * POST /api/auth/login — exchange credentials for a session cookie.
 *
 * Wrong email and wrong password return the identical 401, so the response
 * cannot be used to enumerate which accounts exist.
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parseCredentials(req.body);

    const record = await findUserByEmailWithHash(email);
    const passwordMatches = await verifyPassword(
      password,
      record?.passwordHash ?? (await getDecoyHash()),
    );

    if (record === null || !passwordMatches) {
      throw unauthorized('Invalid email or password');
    }

    const { passwordHash: _passwordHash, ...user } = record;
    res.json(startSession(res, user));
  }),
);

/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * The options must match those the cookie was set with, or the browser keeps
 * the original. Always 204, whether or not a session was present.
 */
authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(config.authCookieName, options);
  res.status(204).end();
});

/** GET /api/auth/me — the signed-in user; how the client restores session on load. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findUserById(getUserId(req));
    if (user === null) {
      throw unauthorized('Session is invalid or has expired');
    }
    res.json({ user });
  }),
);
