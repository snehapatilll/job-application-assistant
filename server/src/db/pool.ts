import { readFileSync } from 'node:fs';
import { checkServerIdentity, type ConnectionOptions, type PeerCertificate } from 'node:tls';
import pg from 'pg';
import { config, requireEnv } from '../config.js';

const { Pool } = pg;

/**
 * Managed Postgres connection strings often ship with `sslmode`/`channel_binding`
 * query params. `pg` currently treats `sslmode=require` as an alias for
 * `verify-full` but warns that this will change to weaker libpq semantics in a
 * future major. We strip those params and configure TLS explicitly instead, so
 * the security level is deterministic and does not silently weaken on upgrade.
 */
function buildConnectionString(raw: string): string {
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

/**
 * TLS settings for the database connection.
 *
 * Certificate verification is always on. What changes between providers is
 * *who* signed the certificate and *what hostname* it is expected to carry:
 *
 * - Neon and other public-CA providers need nothing: their chain is already in
 *   Node's trust store, so `DATABASE_CA_FILE` stays unset.
 * - Amazon RDS signs with its own CA, which Node does not trust by default.
 *   Point `DATABASE_CA_FILE` at the RDS bundle or every connection fails with
 *   SELF_SIGNED_CERT_IN_CHAIN.
 * - Reaching a private RDS instance through an SSM port-forward means dialling
 *   `localhost` while the certificate names the real RDS endpoint, so hostname
 *   verification fails. `DATABASE_TLS_SERVERNAME` carries the name to verify
 *   against, which keeps verification strict through the tunnel.
 *
 * Disabling `rejectUnauthorized` would make all three "work" and is exactly
 * what this file exists to avoid: it accepts any certificate, including an
 * attacker's.
 */
export function buildTlsOptions(): ConnectionOptions {
  const options: ConnectionOptions = { rejectUnauthorized: true };

  if (config.databaseCaFile !== undefined) {
    options.ca = readFileSync(config.databaseCaFile, 'utf8');
  }

  if (config.databaseTlsServername !== undefined) {
    const expected = config.databaseTlsServername;

    // SNI, so the server knows which certificate to present.
    options.servername = expected;

    // `pg` overwrites `servername` with the host it actually dialled, so on a
    // tunnelled connection the default check compares the certificate against
    // "localhost" and fails with ERR_TLS_CERT_ALTNAME_INVALID. Redirect the
    // check at the real endpoint name instead. This is still a full identity
    // check — against the name we expect rather than the one we dialled — and
    // the CA chain is verified either way.
    options.checkServerIdentity = (_host: string, cert: PeerCertificate) =>
      checkServerIdentity(expected, cert);
  }

  return options;
}

/**
 * A single connection Pool created once and reused across the whole app.
 *
 * Import `pool` anywhere that needs the database; do NOT create additional
 * pools.
 */
export const pool = new Pool({
  connectionString: buildConnectionString(requireEnv('DATABASE_URL')),
  ssl: buildTlsOptions(),
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
