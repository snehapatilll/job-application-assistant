import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

/** Catch-all for unmatched routes, so the client gets JSON rather than HTML. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No route matches ${req.method} ${req.path}` });
};

/**
 * Central error handler. Anything that is not an explicit `HttpError` is an
 * unexpected bug: it gets logged in full server-side and reduced to a generic
 * 500 for the client, so stack traces and SQL text never reach the browser.
 *
 * Must be registered last, after all routes.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
