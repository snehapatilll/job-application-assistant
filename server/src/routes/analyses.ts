import { Router } from 'express';
import { z } from 'zod';
import { buildAnalysis } from '../services/analysisService.js';
import { findAnalysisById, insertAnalysis } from '../repositories/analysisRepository.js';
import { findResumeById } from '../repositories/resumeRepository.js';
import { badRequest, HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getUserId, requireAuth } from '../middleware/requireAuth.js';

export const analysesRouter = Router();

analysesRouter.use(requireAuth);

/**
 * A posting shorter than this is almost certainly a mistake — a title pasted
 * without the body — and would produce a confidently useless analysis.
 */
const MIN_JOB_DESCRIPTION_CHARS = 100;
const MAX_JOB_DESCRIPTION_CHARS = 30_000;

const createAnalysisSchema = z.object({
  resumeId: z.coerce.number().int().positive(),
  jobDescription: z
    .string()
    .trim()
    .min(
      MIN_JOB_DESCRIPTION_CHARS,
      `Paste the full job description — at least ${MIN_JOB_DESCRIPTION_CHARS} characters.`,
    )
    .max(MAX_JOB_DESCRIPTION_CHARS, 'That job description is too long.'),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * POST /api/analyses — analyse one of the user's resumes against a posting.
 *
 * The resume is loaded through the user-scoped lookup first, so a resumeId
 * belonging to someone else is a 404 before any LLM call is made — an
 * unauthorized request must never cost a Gemini request.
 */
analysesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Please check the form and try again', fieldErrors(parsed.error));
    }

    const userId = getUserId(req);
    const resume = await findResumeById(userId, parsed.data.resumeId);
    if (resume === null) {
      throw new HttpError(404, 'Resume not found');
    }

    const result = await buildAnalysis(resume.extractedText, parsed.data.jobDescription);

    const analysis = await insertAnalysis({
      userId,
      resumeId: resume.id,
      jobDescriptionText: parsed.data.jobDescription,
      result,
    });

    res.status(201).json({ analysis });
  }),
);

/** GET /api/analyses/:id — reopen a stored analysis. */
analysesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) {
      throw badRequest('Invalid analysis id');
    }

    const analysis = await findAnalysisById(getUserId(req), id.data);
    if (analysis === null) {
      throw new HttpError(404, 'Analysis not found');
    }
    res.json({ analysis });
  }),
);
