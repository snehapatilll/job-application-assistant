-- ---------------------------------------------------------------------------
-- Job Application Assistant — database schema
--
-- Plain CREATE TABLE statements, run against Neon via `npm run db:setup`.
-- Idempotent (IF NOT EXISTS) so it can be re-run safely.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resumes (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  extracted_text    TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_descriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analyses (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resume_id           INTEGER NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  job_description_id  INTEGER NOT NULL REFERENCES job_descriptions (id) ON DELETE CASCADE,
  result              JSONB NOT NULL,
  fit_score           INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes on foreign keys to keep joins and cascade deletes efficient.
CREATE INDEX IF NOT EXISTS idx_resumes_user_id          ON resumes (user_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_resume_id       ON analyses (resume_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job_desc_id     ON analyses (job_description_id);

-- Composite index supporting the "my history, newest first" query.
CREATE INDEX IF NOT EXISTS idx_analyses_user_created
  ON analyses (user_id, created_at DESC);
