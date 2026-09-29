import { query } from '../db/pool.js';

/** A resume without its body text — what list views need. */
export interface ResumeSummary {
  id: number;
  originalFilename: string;
  characterCount: number;
  createdAt: string;
}

/** A resume including the extracted text. */
export interface Resume extends ResumeSummary {
  extractedText: string;
}

interface ResumeRow {
  id: number;
  original_filename: string;
  extracted_text: string;
  character_count: string | number;
  created_at: Date;
}

/**
 * `length()` is computed in SQL so list queries never pull whole resumes over
 * the wire. Postgres returns bigint-ish counts as strings through `pg`, hence
 * the Number() below.
 */
const SUMMARY_COLUMNS = `id, original_filename, length(extracted_text) AS character_count, created_at`;

function toSummary(row: ResumeRow): ResumeSummary {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    characterCount: Number(row.character_count),
    createdAt: row.created_at.toISOString(),
  };
}

/** Store a newly uploaded resume and return its summary. */
export async function insertResume(
  userId: number,
  originalFilename: string,
  extractedText: string,
): Promise<ResumeSummary> {
  const result = await query<ResumeRow>(
    `INSERT INTO resumes (user_id, original_filename, extracted_text)
          VALUES ($1, $2, $3)
       RETURNING ${SUMMARY_COLUMNS}`,
    [userId, originalFilename, extractedText],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('INSERT ... RETURNING produced no row');
  }
  return toSummary(row);
}

/** List a user's resumes, newest first. */
export async function listResumes(userId: number): Promise<ResumeSummary[]> {
  const result = await query<ResumeRow>(
    `SELECT ${SUMMARY_COLUMNS}
       FROM resumes
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return result.rows.map(toSummary);
}

/**
 * Fetch one resume including its text.
 *
 * `user_id` is part of the WHERE clause rather than checked afterwards, so
 * another user's id simply returns nothing — there is no code path where the
 * row is loaded first and the ownership test could be forgotten.
 */
export async function findResumeById(userId: number, resumeId: number): Promise<Resume | null> {
  const result = await query<ResumeRow>(
    `SELECT ${SUMMARY_COLUMNS}, extracted_text
       FROM resumes
      WHERE id = $1 AND user_id = $2`,
    [resumeId, userId],
  );

  const row = result.rows[0];
  if (row === undefined) return null;

  return { ...toSummary(row), extractedText: row.extracted_text };
}
