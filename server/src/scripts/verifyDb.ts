import { z } from 'zod';
import { pool, closePool } from '../db/pool.js';

/**
 * Verifies the database connection and that the expected tables exist.
 * Run with `npm run db:verify` after `db:setup`.
 */
const rowSchema = z.object({
  now: z.date(),
  version: z.string(),
});

const tableRowSchema = z.object({ table_name: z.string() });

async function main(): Promise<void> {
  const result = await pool.query('SELECT now() AS now, version() AS version');
  const info = rowSchema.parse(result.rows[0]);
  console.log('✅ Connected to PostgreSQL');
  console.log(`   server time: ${info.now.toISOString()}`);
  console.log(`   version:     ${info.version.split(',')[0]}`);

  const tables = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`,
  );
  const names = tables.rows.map((r) => tableRowSchema.parse(r).table_name);
  console.log(`   tables:      ${names.length ? names.join(', ') : '(none yet)'}`);

  const expected = ['analyses', 'job_descriptions', 'resumes', 'users'];
  const missing = expected.filter((t) => !names.includes(t));
  if (missing.length) {
    console.warn(`⚠️  Missing tables: ${missing.join(', ')} — run "npm run db:setup".`);
  } else {
    console.log('✅ All expected tables present.');
  }
}

main()
  .catch((err: unknown) => {
    console.error('❌ Database verification failed:');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
