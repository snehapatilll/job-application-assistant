/**
 * An error carrying an HTTP status code, thrown by routes and services and
 * translated into a JSON response by the central error handler.
 *
 * Anything thrown that is NOT an HttpError is treated as an unexpected bug:
 * it is logged in full and reported to the client as a generic 500, so
 * internal details never leak.
 */
export class HttpError extends Error {
  readonly status: number;
  /** Optional per-field messages, used for validation failures. */
  readonly details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export const badRequest = (message: string, details?: Record<string, string>): HttpError =>
  new HttpError(400, message, details);

export const unauthorized = (message = 'Not authenticated'): HttpError =>
  new HttpError(401, message);

export const conflict = (message: string): HttpError => new HttpError(409, message);
