import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { resumesRouter } from './routes/resumes.js';
import { analysesRouter } from './routes/analyses.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

/**
 * In production a proxy (CloudFront, a load balancer) terminates TLS and
 * forwards over plain HTTP. Without this, Express believes the request was
 * insecure and `req.protocol` is wrong — which matters because the session
 * cookie is marked Secure.
 */
if (config.isProduction) {
  app.set('trust proxy', 1);
}

/**
 * `credentials: true` is what lets the browser send and store the session
 * cookie, and it requires an explicit origin — the `*` wildcard is rejected
 * for credentialed requests. In development Vite proxies `/api`, so this
 * mainly matters once the client is deployed on its own origin.
 */
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

/**
 * Phase 1 hello-world / health endpoint.
 * The frontend calls this to confirm the two apps are wired together.
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Job Application Assistant API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/analyses', analysesRouter);

/**
 * In production the API also serves the built React app, so the whole thing is
 * one origin: the session cookie stays SameSite=Lax with no CORS credentials
 * setup, which splitting the client onto its own host would have forced.
 *
 * In development this is skipped — the Vite dev server owns the client and
 * proxies /api here.
 */
if (config.isProduction) {
  app.use(
    express.static(config.clientDistPath, {
      // Vite fingerprints asset filenames, so a new build never reuses a URL
      // and these can be cached hard. `index: false` leaves "/" to the
      // fallback below, which is the only thing that serves HTML.
      index: false,
      maxAge: '1y',
    }),
  );

  // Client-side routes have no file on disk, so anything that is not an API
  // call gets the app shell and React Router takes it from there. Without
  // this, reloading on /history returns a 404.
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    // The shell must never be cached: it names the hashed asset files, so a
    // stale copy sends browsers after assets the latest deploy no longer has.
    // `sendFile` would otherwise set `public, max-age=0`, which a CDN is free
    // to store and serve.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(join(config.clientDistPath, 'index.html'));
  });
}

// Must stay last: the 404 catch-all, then the error handler.
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});
