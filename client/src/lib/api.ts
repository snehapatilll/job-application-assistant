/**
 * The single place the browser talks to the API.
 *
 * Every request sets `credentials: 'include'` because the session lives in an
 * httpOnly cookie the page cannot read. Forgetting it on one call would make
 * that call silently unauthenticated, so no component should call `fetch`
 * directly — go through here.
 */

/** In dev, Vite proxies /api to the backend, so a relative path is correct. */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** An error carrying the API's status and any per-field messages. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: Record<string, string>;

  constructor(status: number, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** True when the user simply is not signed in, which callers treat specially. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface ErrorBody {
  error?: string;
  details?: Record<string, string>;
}

async function toResult<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const { error, details } = (body ?? {}) as ErrorBody;
    throw new ApiError(res.status, error ?? `Request failed with ${res.status}`, details ?? {});
  }

  return body as T;
}

/** Send a JSON request (or a bodyless one). */
export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return toResult<T>(res);
}

/**
 * Upload a file as multipart/form-data.
 *
 * Content-Type is deliberately not set: the browser has to add it itself so it
 * can include the multipart boundary.
 */
export async function apiUpload<T>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  return toResult<T>(res);
}
