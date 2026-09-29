import { pool } from '../../src/db/pool.js';
import type { AnalysisResult } from '../../src/services/analysisService.js';

/**
 * Insert an analysis directly, bypassing the LLM.
 *
 * History tests care about listing, ordering, and isolation — none of which
 * depend on what the model said. Going through POST /api/analyses would make
 * them cost Gemini quota and fail whenever the API is rate-limited.
 */
export async function seedAnalysis({
  userId,
  resumeId,
  jobText,
  fitScore,
}: {
  userId: number;
  resumeId: number;
  jobText: string;
  fitScore: number;
}): Promise<number> {
  const result: AnalysisResult = {
    fitScore,
    summary: 'Seeded for tests.',
    matchedSkills: [{ skill: 'TypeScript', importance: 'critical', evidence: 'Seeded.' }],
    missingSkills: [{ skill: 'Kubernetes', importance: 'nice_to_have' }],
    bulletSuggestions: [{ suggested: 'Seeded bullet.', rationale: 'Seeded rationale.' }],
    coverLetter: 'Seeded cover letter.',
    // Derived from fitScore rather than hardcoded, so seeded rows never show a
    // score that contradicts the arithmetic printed beside it.
    scoreBreakdown: {
      earnedWeight: fitScore,
      totalWeight: 100,
      weights: { critical: 3, important: 2, nice_to_have: 1 },
    },
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const job = await client.query<{ id: number }>(
      'INSERT INTO job_descriptions (user_id, text) VALUES ($1, $2) RETURNING id',
      [userId, jobText],
    );

    const analysis = await client.query<{ id: number }>(
      `INSERT INTO analyses (user_id, resume_id, job_description_id, result, fit_score)
            VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
      [userId, resumeId, job.rows[0]!.id, result, fitScore],
    );

    await client.query('COMMIT');
    return analysis.rows[0]!.id;
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
