import dotenv from 'dotenv';

dotenv.config();

/**
 * Read a required environment variable, throwing a clear error if it is
 * missing. Use this for values that must exist before a feature can run
 * (DB connection string, JWT secret, LLM key) so failures are explicit.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Centralized, typed access to environment configuration.
 *
 * Non-critical values are read eagerly with defaults. Secrets (DATABASE_URL,
 * JWT_SECRET, GEMINI_API_KEY) are read lazily via `requireEnv` where they are
 * used, so the server still boots for endpoints that do not need them.
 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
