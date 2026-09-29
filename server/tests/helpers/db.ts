import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { closePool, query } from '../../src/db/pool.js';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Read one of the committed resume fixtures. */
export async function fixture(name: string): Promise<Buffer> {
  return readFile(join(FIXTURES_DIR, name));
}

/**
 * Delete this run's test accounts.
 *
 * Only rows matching the caller's run id are removed, so concurrent test files
 * never clean up each other's data. Resumes, job descriptions, and analyses go
 * with the user via ON DELETE CASCADE.
 */
export async function deleteTestUsers(runId: string): Promise<number> {
  const result = await query('DELETE FROM users WHERE email LIKE $1', [`jaa-test-${runId}-%`]);
  return result.rowCount ?? 0;
}

/** Close the pool this test process opened, so the run can exit. */
export async function closeTestPool(): Promise<void> {
  await closePool();
}
