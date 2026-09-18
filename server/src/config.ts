import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized, typed access to environment configuration.
 *
 * Only a subset is required in Phase 1 (the server runs without a DB or LLM
 * key). Values needed by later phases are read lazily where they are used, so
 * the hello-world server still boots with a minimal `.env`.
 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
