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

/** A history row — enough to identify an analysis without its full result. */
export interface AnalysisSummary {
  id: number;
  fitScore: number;
  createdAt: string;
  resumeFilename: string;
  /** First line of the job description, used as the row's title. */
  jobTitle: string;
}

interface AnalysisSummaryRow {
  id: number;
  fit_score: number;
  created_at: Date;
  original_filename: string;
  job_excerpt: string;
}

/**
 * The first non-empty line of a pasted posting, which is almost always its
 * title. Falls back to the leading text when the posting has no line breaks.
 */
function deriveJobTitle(excerpt: string): string {
  const firstLine = excerpt
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');

  const title = firstLine ?? excerpt.trim();
  return title === '' ? 'Untitled posting' : title.slice(0, 120);
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
 * List a user's analyses, newest first.
 *
 * The `result` JSONB is deliberately not selected — a history page needs a
 * score and a label, not several kilobytes of cover letter per row. Only the
 * first 300 characters of each job description come back, enough to derive a
 * title from.
 *
 * One extra row beyond `limit` is fetched to answer "is there more?" without
 * a second COUNT query over the same index.
 */
export async function listAnalyses(
  userId: number,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ analyses: AnalysisSummary[]; hasMore: boolean }> {
  const result = await query<AnalysisSummaryRow>(
    `SELECT a.id,
            a.fit_score,
            a.created_at,
            r.original_filename,
            left(j.text, 300) AS job_excerpt
       FROM analyses a
       JOIN resumes r          ON r.id = a.resume_id
       JOIN job_descriptions j ON j.id = a.job_description_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset],
  );

  const hasMore = result.rows.length > limit;

  return {
    hasMore,
    analyses: result.rows.slice(0, limit).map((row) => ({
      id: row.id,
      fitScore: row.fit_score,
      createdAt: row.created_at.toISOString(),
      resumeFilename: row.original_filename,
      jobTitle: deriveJobTitle(row.job_excerpt),
    })),
  };
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
