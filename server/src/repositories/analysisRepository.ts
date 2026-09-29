import { pool, query } from '../db/pool.js';
import type { AnalysisResult } from '../services/analysisService.js';

/** A stored analysis, as returned to the client. */
export interface Analysis {
  id: number;
  resumeId: number;
  jobDescriptionId: number;
  fitScore: number;
  result: AnalysisResult;
  createdAt: string;
}

interface AnalysisRow {
  id: number;
  resume_id: number;
  job_description_id: number;
  fit_score: number;
  result: AnalysisResult;
  created_at: Date;
}

function toAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    resumeId: row.resume_id,
    jobDescriptionId: row.job_description_id,
    fitScore: row.fit_score,
    result: row.result,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Store a job description and its analysis in one transaction.
 *
 * Both rows belong together: an orphaned job_descriptions row with no analysis
 * would show up as a phantom in any later reporting, and the analysis cannot
 * exist without its job description. A single client is checked out so both
 * INSERTs share the transaction.
 */
export async function insertAnalysis(params: {
  userId: number;
  resumeId: number;
  jobDescriptionText: string;
  result: AnalysisResult;
}): Promise<Analysis> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query<{ id: number }>(
      `INSERT INTO job_descriptions (user_id, text) VALUES ($1, $2) RETURNING id`,
      [params.userId, params.jobDescriptionText],
    );
    const jobRow = jobResult.rows[0];
    if (jobRow === undefined) {
      throw new Error('INSERT ... RETURNING produced no job_descriptions row');
    }

    const analysisResult = await client.query<AnalysisRow>(
      `INSERT INTO analyses (user_id, resume_id, job_description_id, result, fit_score)
            VALUES ($1, $2, $3, $4, $5)
         RETURNING id, resume_id, job_description_id, fit_score, result, created_at`,
      [params.userId, params.resumeId, jobRow.id, params.result, params.result.fitScore],
    );
    const analysisRow = analysisResult.rows[0];
    if (analysisRow === undefined) {
      throw new Error('INSERT ... RETURNING produced no analyses row');
    }

    await client.query('COMMIT');
    return toAnalysis(analysisRow);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always return the client to the pool, or the pool leaks connections.
    client.release();
  }
}

/**
 * Fetch one analysis. `user_id` is in the WHERE clause, so another user's id
 * simply returns nothing rather than relying on a check after loading.
 */
export async function findAnalysisById(
  userId: number,
  analysisId: number,
): Promise<Analysis | null> {
  const result = await query<AnalysisRow>(
    `SELECT id, resume_id, job_description_id, fit_score, result, created_at
       FROM analyses
      WHERE id = $1 AND user_id = $2`,
    [analysisId, userId],
  );

  const row = result.rows[0];
  return row === undefined ? null : toAnalysis(row);
}
