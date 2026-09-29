import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { MAX_UPLOAD_BYTES } from '../services/textExtraction.js';
import { badRequest } from '../utils/httpError.js';

/**
 * Uploads are held in memory, never written to disk: the file is parsed to
 * text within the request and only that text is kept, so there is no upload
 * directory to secure, clean up, or carry across a deploy.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const singleResume = upload.single('resume');

/**
 * Accept one `resume` file part, turning multer's own errors into 400s.
 * Without this, exceeding the size limit surfaces as an unhandled 500.
 */
export const uploadResume: RequestHandler = (req, res, next) => {
  singleResume(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          badRequest(
            `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.`,
          ),
        );
        return;
      }
      next(badRequest(`Upload failed: ${err.message}`));
      return;
    }
    next(err);
  });
};
