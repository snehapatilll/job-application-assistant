import { basename } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { extractResumeText } from '../services/textExtraction.js';
import {
  findResumeById,
  insertResume,
  listResumes,
} from '../repositories/resumeRepository.js';
import { badRequest, HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getUserId, requireAuth } from '../middleware/requireAuth.js';
import { uploadResume } from '../middleware/upload.js';

export const resumesRouter = Router();

/** Every route here is per-user data. */
resumesRouter.use(requireAuth);

const MAX_FILENAME_LENGTH = 255;

/**
 * The client supplies the filename, so treat it as untrusted: keep only the
 * base name (no directory traversal), drop control characters, and cap the
 * length. It is stored purely to label the upload back to the user.
 */
function sanitizeFilename(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = basename(raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned === '' ? 'resume' : cleaned).slice(0, MAX_FILENAME_LENGTH);
}

const resumeIdSchema = z.coerce.number().int().positive();

function parseResumeId(raw: string | undefined): number {
  const parsed = resumeIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest('Invalid resume id');
  }
  return parsed.data;
}

/**
 * POST /api/resumes — upload a resume and store the text pulled out of it.
 *
 * The file itself is never persisted; only the extracted text is, which is all
 * the analysis phase needs.
 */
resumesRouter.post(
  '/',
  uploadResume,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (file === undefined) {
      throw badRequest('No file was uploaded. Attach a PDF or DOCX in the "resume" field.');
    }

    const { format, text } = await extractResumeText(file.buffer);

    const resume = await insertResume(
      getUserId(req),
      sanitizeFilename(file.originalname),
      text,
    );

    res.status(201).json({ resume, format });
  }),
);

/** GET /api/resumes — the signed-in user's uploads, newest first. */
resumesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ resumes: await listResumes(getUserId(req)) });
  }),
);

/** GET /api/resumes/:id — one resume, including its extracted text. */
resumesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const resume = await findResumeById(getUserId(req), parseResumeId(req.params.id));
    if (resume === null) {
      throw new HttpError(404, 'Resume not found');
    }
    res.json({ resume });
  }),
);
