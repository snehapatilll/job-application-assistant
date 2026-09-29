import express, { type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { resumesRouter } from './routes/resumes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

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

// Must stay last: the 404 catch-all, then the error handler.
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});
