import { query } from '../db/pool.js';
import { conflict } from '../utils/httpError.js';

/** A user as exposed to the client — never includes the password hash. */
export interface PublicUser {
  id: number;
  email: string;
  createdAt: string;
}

/** Internal shape used only for credential checks during login. */
interface UserWithHash extends PublicUser {
  passwordHash: string;
}

/** Row shape returned by the queries below, in raw snake_case from Postgres. */
interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Emails are stored and compared in a single canonical form (trimmed and
 * lowercased) so that "A@b.com" and "a@b.com " cannot become two accounts.
 * Every lookup MUST normalize the same way.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Look up a user including the password hash. Used only by login; everything
 * else should use `findUserById` so hashes never travel further than needed.
 */
export async function findUserByEmailWithHash(email: string): Promise<UserWithHash | null> {
  const result = await query<UserRow>(
    `SELECT id, email, password_hash, created_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)],
  );

  const row = result.rows[0];
  if (row === undefined) return null;

  return { ...toPublicUser(row), passwordHash: row.password_hash };
}

/** Look up a user by id. Used by the auth middleware and `/api/auth/me`. */
export async function findUserById(id: number): Promise<PublicUser | null> {
  const result = await query<UserRow>(
    `SELECT id, email, password_hash, created_at
       FROM users
      WHERE id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row === undefined ? null : toPublicUser(row);
}

/**
 * Insert a new user, returning the created row.
 *
 * Two requests racing on the same email can both pass a prior "is it taken?"
 * check, so we rely on the UNIQUE constraint as the real guard and translate
 * its violation into a 409 rather than a 500.
 */
export async function insertUser(email: string, passwordHash: string): Promise<PublicUser> {
  try {
    const result = await query<UserRow>(
      `INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
         RETURNING id, email, password_hash, created_at`,
      [normalizeEmail(email), passwordHash],
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT ... RETURNING produced no row');
    }
    return toPublicUser(row);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === UNIQUE_VIOLATION) {
      throw conflict('An account with that email already exists');
    }
    throw err;
  }
}
