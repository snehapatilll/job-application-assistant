import pg from 'pg';
import { requireEnv } from '../config.js';

const { Pool } = pg;

/**
 * A single connection Pool created once and reused across the whole app.
 *
 * Import `pool` anywhere that needs the database; do NOT create additional
 * pools. Neon requires TLS, so SSL is enabled. `rejectUnauthorized: false`
 * is the standard setting for Neon's pooled endpoint (its cert chain is not
 * in Node's default trust store) — the connection is still encrypted.
 */
export const pool = new Pool({
  connectionString: requireEnv('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // Log unexpected errors on idle clients rather than crashing the process.
  // eslint-disable-next-line no-console
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Thin typed wrapper around `pool.query` for parameterized queries.
 * Always pass values via the `params` array ($1, $2, ...) — never interpolate
 * user input into the SQL string.
 */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] | undefined);
}

/** Close the pool (used by scripts and graceful shutdown). */
export async function closePool(): Promise<void> {
  await pool.end();
}
