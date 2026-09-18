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
| Database | PostgreSQL (Neon) via the `pg` driver with hand-written SQL       |
| LLM      | Google Gemini (Flash) via `@google/genai`                         |
| Auth     | JWT (email + password, bcrypt-hashed)                             |

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

Open <http://localhost:5173>. The page calls the backend's `/api/health`
endpoint (proxied through Vite) and displays the response, confirming the two
apps are wired together.

## Build order / roadmap

1. ✅ **Scaffold monorepo** — both apps run, frontend hits a backend hello-world.
2. ⬜ Schema + `pg` Pool + `db:setup`; verify Neon connection.
3. ⬜ User repository + auth (register/login/JWT).
4. ⬜ File upload + text extraction endpoint.
5. ⬜ LLM service (structured output) + fit-score logic wired into `/analyze`.
6. ⬜ Frontend New Analysis flow + Result view.
7. ⬜ History (save + list + reopen).
8. ⬜ Polish: error states, README, styling.
