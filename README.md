# AI-Powered Job Application Assistant

Upload your resume (PDF or DOCX), paste a job description, and get back an
explainable fit score, matched vs. missing skills, tailored resume bullet
suggestions, and a cover letter draft — generated via an LLM. Each user keeps a
private history of past analyses.

> **Status:** Under active construction. This README is expanded in the final
> polish phase with screenshots, full architecture notes, and design decisions.

## Monorepo layout

```
job-application-assistant/
├── client/          # React + TypeScript + Vite + Tailwind frontend
├── server/          # Node + Express + TypeScript backend (raw SQL via pg)
├── docs/            # infrastructure notes
├── .gitignore
└── README.md
```

Each app is independently runnable and has its own `package.json` and
`.env.example`.

## Tech stack

| Layer    | Choice                                                             |
| -------- | ----------------------------------------------------------------- |
| Frontend | React + TypeScript, Vite, Tailwind CSS, React Query, React Router |
| Backend  | Node.js + Express + TypeScript (strict)                           |
| Database | PostgreSQL via the `pg` driver with hand-written SQL               |
| LLM      | Google Gemini (Flash) via `@google/genai`                         |
| Auth     | JWT in an httpOnly cookie (email + password, bcrypt-hashed)       |

## Architecture (high level)

```
Browser ──► Express API ──► pg Pool ──► Neon (PostgreSQL)
                     └────► Google Gemini API
```

The browser never talks to the database or the LLM directly. The Express backend
is the single gatekeeper for all secrets, DB access, and LLM calls.

## Running locally (Phase 1)

You need **Node.js 18+** installed.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # then edit values (Windows: copy .env.example .env)
npm run dev            # starts on http://localhost:3001
```

Health check: open <http://localhost:3001/api/health> — you should see JSON.

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev            # starts on http://localhost:5173
```

Open <http://localhost:5173>. Create an account, upload a resume, paste a job
description, and the analysis appears on its own page.

### Frontend notes

The session cookie is httpOnly, so the page cannot read it to find out whether
it is signed in — it asks the server instead, via `/api/auth/me` on load. That
answer is the app's single source of truth for auth state.

Two consequences worth knowing:

- Every request goes through `src/lib/api.ts`, which sets
  `credentials: 'include'`. A component calling `fetch` directly would be
  silently unauthenticated, so nothing else is allowed to.
- `ProtectedRoute` renders a placeholder while that first check is in flight
  rather than redirecting, otherwise a signed-in user reloading the page would
  be bounced to `/login` for a moment before the answer arrived.

Signing out clears the React Query cache as well as the cookie, so the next
person to use the browser never sees the previous user's resumes.

## Database connection and TLS

The app talks to any Postgres over `DATABASE_URL`. Certificate verification is
always on — `rejectUnauthorized` is never disabled — so what changes between
providers is which CA signed the certificate and which hostname it carries.

The database currently runs on Amazon RDS in a private subnet, reached through
AWS Systems Manager. [docs/aws-setup.md](docs/aws-setup.md) covers that
infrastructure, what it costs, and the two things that went wrong while
building it.

| Setup | `DATABASE_CA_FILE` | `DATABASE_TLS_SERVERNAME` |
| ----- | ------------------ | ------------------------- |
| Neon, or any publicly trusted cert | unset | unset |
| RDS, reachable directly | the RDS CA bundle | unset |
| RDS in a private subnet, via SSM port forward | the RDS CA bundle | the real RDS endpoint |

Two things make RDS different from a public-CA provider:

1. **Amazon signs with its own CA**, which is not in Node's trust store. Without
   a bundle every connection fails with `SELF_SIGNED_CERT_IN_CHAIN`:

   ```bash
   curl -o server/certs/rds-global-bundle.pem \
     https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```

   The bundle is fetched rather than committed — Amazon rotates these, and a
   stale copy in git is worse than none.

2. **Through a port forward you dial `localhost`** while the certificate names
   the RDS endpoint, so the hostname check fails with
   `ERR_TLS_CERT_ALTNAME_INVALID`. `DATABASE_TLS_SERVERNAME` fixes that.

   Setting SNI alone is not enough: `pg` overwrites `servername` with the host
   it actually dialled, so the default check still compares the certificate
   against `localhost`. The pool therefore also overrides `checkServerIdentity`
   to verify against the real endpoint name. That remains a full identity check
   — against the name we expect rather than the one we dialled — and the CA
   chain is verified either way. The shortcut, `rejectUnauthorized: false`,
   makes the error disappear by accepting any certificate at all.

## Tests

Node's built-in test runner, executed through `tsx` — no test framework
dependency.

```bash
cd server
npm test          # unit + API tests
npm run test:unit # scoring and validation only; no database, no network
npm run test:live # the real Gemini round-trip (costs API quota)
```

- `tests/unit/` — pure logic: fit-score arithmetic and LLM response validation.
- `tests/api/` — every route driven over real HTTP against a server the suite
  spawns on a free port, so the middleware stack, cookie handling, and error
  handlers are exercised exactly as in production. These need `DATABASE_URL`.
- `tests/live/` — the one test that calls Gemini. Kept out of `npm test` on
  purpose: it costs quota, takes seconds, and fails when the API is
  rate-limited, none of which should break an ordinary run.

Each run namespaces its accounts as `jaa-test-<runId>-*` and deletes them
afterwards, so concurrent test files never clean up each other's rows.

## API

| Method | Route                | Auth | Purpose                                     |
| ------ | -------------------- | ---- | ------------------------------------------- |
| GET    | `/api/health`        | —    | Liveness check                              |
| POST   | `/api/auth/register` | —    | Create an account, start a session          |
| POST   | `/api/auth/login`    | —    | Exchange credentials for a session          |
| POST   | `/api/auth/logout`   | —    | Clear the session cookie                    |
| GET    | `/api/auth/me`       | ✅   | Current user — used to restore session state |
| POST   | `/api/resumes`       | ✅   | Upload a PDF/DOCX resume, store its text     |
| GET    | `/api/resumes`       | ✅   | The user's resumes, newest first             |
| GET    | `/api/resumes/:id`   | ✅   | One resume, including the extracted text     |
| POST   | `/api/analyses`      | ✅   | Analyse a resume against a job description   |
| GET    | `/api/analyses`      | ✅   | History, newest first (`limit`, `offset`)    |
| GET    | `/api/analyses/:id`  | ✅   | Reopen a stored analysis                     |

### Auth design notes

The session JWT travels in an **httpOnly, SameSite=Lax cookie**, not in
`localStorage`. The tradeoff:

- **httpOnly** means page JavaScript cannot read the token, so an XSS bug
  cannot exfiltrate a session the way it could from `localStorage`.
- **SameSite=Lax** blocks other origins from making authenticated state-changing
  requests, which is what stands in for a CSRF token in this project.
- The cost is that the client cannot inspect its own token; it calls
  `/api/auth/me` on load to find out whether it is signed in.

### Upload design notes

Uploads are parsed in memory and **the file itself is never written to disk** —
only the extracted text is stored. There is no upload directory to secure, clean
up, or persist across a deploy, and nothing to serve back by accident.

- File type is decided by **magic bytes**, not by the extension or the
  browser-supplied `Content-Type`, both of which the client controls. A `.txt`
  renamed to `.pdf` is rejected.
- 5MB cap, enforced by multer before the file is parsed.
- A PDF that yields almost no text (a scan) is a 400 explaining the cause,
  rather than an empty analysis that fails confusingly later.
- Legacy `.doc` is detected by its OLE2 header and gets its own message telling
  the user to re-save as `.docx`.
- Stored filenames are reduced to their base name, so `../../etc/passwd.pdf`
  becomes `passwd.pdf`.
- `user_id` is part of the `WHERE` clause on every resume query, not an
  ownership check applied afterwards — there is no path where a row is loaded
  first and the check could be skipped.

### Analysis design notes

**The fit score is computed, not generated.** Gemini identifies the skills a
posting requires and judges whether the resume evidences each one; the score is
then derived from weighted coverage (`critical` 3, `important` 2,
`nice_to_have` 1):

```
fitScore = round(100 × matched weight ÷ total weight)
```

Asking a model for a number directly gives something that drifts between runs
and cannot be justified. Deriving it means the figure always reconciles with the
matched/missing lists shown beside it, and identical input gives an identical
score. The arithmetic is returned as `scoreBreakdown` so the UI can show its
working.

Other decisions:

- The model returns **one** `requiredSkills` list with a `matched` flag rather
  than separate matched/missing arrays — it has to commit to a single view of
  the posting, and the server does the partitioning.
- Output is validated with Zod after parsing. Structured output makes the shape
  very likely, not guaranteed, and everything downstream assumes those fields.
- Resume and job text are untrusted input that ends up in a prompt. The system
  instruction says to treat their contents as data, and nothing downstream acts
  on the result beyond storing and displaying it.
- Transient `503`/`429` responses are retried up to three times with backoff,
  under a single 60-second budget covering all attempts.
- The resume is loaded through the user-scoped query *before* any LLM call, so
  an unauthorized `resumeId` can never cost a Gemini request.
- The job description and the analysis are inserted in one transaction, so a
  failure cannot leave an orphaned `job_descriptions` row.

### History notes

The list query deliberately does **not** select the `result` JSONB — a history
page needs a score and a label, not several kilobytes of cover letter per row.
It takes only the first 300 characters of each job description and derives the
row's title from the first non-empty line, which is almost always the posting's
title.

Paging fetches one row beyond `limit` to answer "is there more?", rather than
running a second `COUNT` over the same index. It is served by the
`(user_id, created_at DESC)` index added back in Phase 2.

Other decisions worth knowing:

- Passwords are bcrypt-hashed at cost 12, and capped at 72 **bytes** because
  bcrypt silently ignores anything beyond that.
- Login returns the same 401 for an unknown email and a wrong password, and
  compares against a decoy hash when no user matches, so neither the response
  body nor its timing reveals which emails are registered.
- The JWT carries only `sub` (the user id). Everything else is re-read from the
  database per request, so a deleted account cannot keep using a live token.

## Build order / roadmap

1. ✅ **Scaffold monorepo** — both apps run, frontend hits a backend hello-world.
2. ✅ **Schema + `pg` Pool + `db:setup`** — Neon connection verified.
3. ✅ User repository + auth (register/login/JWT).
4. ✅ File upload + text extraction.
5. 🚧 LLM service (structured output) + fit-score logic — built; the live Gemini
   round-trip is still unverified (free-tier quota).
6. ✅ Frontend New Analysis flow + Result view.
7. ✅ History (save + list + reopen).
8. ⬜ Polish: error states, README, styling.
