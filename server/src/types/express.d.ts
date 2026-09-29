/**
 * Augments Express's `Request` with the authenticated user id.
 *
 * `requireAuth` is the only thing that sets this. It stays optional here
 * because every request object starts out unauthenticated; handlers read it
 * through `getUserId()` rather than asserting it is present.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export {};
