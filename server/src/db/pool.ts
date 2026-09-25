import pg from 'pg';
import { requireEnv } from '../config.js';

const { Pool } = pg;

/**
 * Neon connection strings ship with `sslmode`/`channel_binding` query params.
 * `pg` currently treats `sslmode=require` as an alias for `verify-full` but
 * warns that this will change to weaker libpq semantics in a future major.
 * We strip those params and configure TLS explicitly instead, so the security
 * level is deterministic and does not silently weaken on upgrade.
 */
function buildConnectionString(raw: string): string {
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

/**
 * A single connection Pool created once and reused across the whole app.
 *
 * Import `pool` anywhere that needs the database; do NOT create additional
 * pools. Neon requires TLS and presents a publicly trusted certificate, so we
 * verify it properly rather than disabling verification.
 */
export const pool = new Pool({
  connectionString: buildConnectionString(requireEnv('DATABASE_URL')),
  ssl: { rejectUnauthorized: true },
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
