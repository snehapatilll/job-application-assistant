import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, closePool } from '../db/pool.js';

/**
 * Runs schema.sql against the configured database. Idempotent thanks to the
 * IF NOT EXISTS clauses in the schema. Invoked via `npm run db:setup`.
 */
async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  // server/src/scripts -> server/schema.sql
  const schemaPath = resolve(here, '../../schema.sql');
  const sql = await readFile(schemaPath, 'utf8');

  console.log(`Applying schema from ${schemaPath} ...`);
  await pool.query(sql);
  console.log('✅ Schema applied successfully.');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Failed to apply schema:');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
