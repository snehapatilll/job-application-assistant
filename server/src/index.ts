import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { config } from './config.js';

const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

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

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});
