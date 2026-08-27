# README.md — Operational Runbook

> Setup, environment configuration, and troubleshooting for developers.

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url>
cd Autonomous-Build-Prompt
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Create `apps/server/.env`:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/autonomous_ai
PORT=3000
NODE_ENV=development

LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

### 4. Start the application

```bash
# Terminal 1: Backend
cd apps/server && pnpm run dev

# Terminal 2: Frontend
cd apps/client && pnpm run dev
```

Open `http://localhost:5173` (Vite default).

## Architecture Summary

| Component | Technology | Location |
|---|---|---|
| Backend | NestJS (TypeScript) | `apps/server/` |
| Frontend | React + Vite | `apps/client/` |
| Database | PostgreSQL via TypeORM | `apps/server/src/database/` |
| API Client | Generated React Query hooks | `lib/api-client-react/` |
| Real-time | Socket.IO | `apps/server/src/realtime/` |

## Project Structure

```
apps/server/src/
├── agents/           # 14 AI agent services
├── aggregate/        # Cross-project API endpoints
├── database/         # TypeORM entities
├── health/           # Health check endpoint
├── llm/              # LLM provider abstraction
├── projects/         # Project CRUD + workflow
├── realtime/         # WebSocket + events
├── rkb/              # Knowledge base
├── settings/         # Pipeline config persistence
└── workflow/         # Workflow orchestration

apps/client/src/
├── components/       # UI components
├── hooks/            # React hooks
├── lib/              # Utilities, API helpers
└── pages/            # Route pages
```

## Environment Variables

See `CONTEXT.md` §6 for full list. Minimum required:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
LLM_PROVIDER=groq
GROQ_API_KEY=your-key-here
```

## API Endpoints

See `CONTEXT.md` §4 for complete route listing.

## Troubleshooting

| Issue | Solution |
|---|---|
| Port 3000 in use | Change `PORT` in `.env` |
| Database connection refused | Check PostgreSQL is running and `DATABASE_URL` is correct |
| LLM errors | Verify API key is valid and has quota |
| WebSocket not connecting | Check CORS settings; ensure frontend port is allowed |
| Build fails | Run `pnpm install` again; check Node.js version ≥18 |

## Useful Commands

```bash
# Build all packages
pnpm run build

# Type check
pnpm run typecheck

# Clean build artifacts
pnpm run clean

# Backend unit tests (validator, LLM structure, runner, digest, order lock, eval, logging)
cd apps/server && pnpm run test:unit

# Golden-dataset regression eval (needs backend + DB + LLM key running)
cd apps/server && pnpm run eval:golden -- --dry-run

# Lint + format (pre-commit hook runs these automatically on staged files)
pnpm lint              # repo-wide ESLint (flat config, typescript-eslint)
pnpm lint:fix          # auto-fix what ESLint can fix
pnpm format            # repo-wide Prettier (config: prettier.config.mjs)
pnpm format:check      # verify formatting without writing
```

## Complete Flow: Step-by-Step

This system works as an end-to-end AI-assisted requirements pipeline. The flow is:

1. User creates a project
   - The user submits an idea through the frontend.
   - The frontend sends a request to the backend API.
   - The backend creates a new project record in the database.
   - The project enters a created state and is ready for workflow execution.

2. Workflow starts
   - When the user clicks Start Analysis, the backend calls the DAG workflow engine.
   - The DAG engine creates a new run with workflow steps and begins layered execution.
   - The pipeline begins running the configured agents sequentially.

3. Discovery agent runs first
   - The discovery agent analyzes the original idea.
   - It extracts domain context, identifies likely scope, and produces structured knowledge items.
   - It may also create clarification questions when more context is needed.

4. Discovery checkpoint pauses the workflow
   - After discovery, the pipeline pauses for human review.
   - The user can confirm, edit, or refine the interpreted context.
   - This checkpoint is important because downstream agents use this confirmed understanding.

5. Later agents build on prior context
   - Research adds domain and feasibility context.
   - Business analysis adds business goals and process understanding.
   - Product analysis defines features and user stories.
   - Requirements engineering converts the earlier understanding into formal requirements.
   - UX, architecture, security, QA, and estimation agents further refine the output.
   - Each stage uses the accumulated project context rather than only the immediate previous result.

6. LLM output is validated and stored
   - Every agent sends structured JSON to the LLM layer.
   - The backend validates the response against the expected schema.
   - If validation fails, the system retries with corrective feedback.
   - Valid output is saved into the knowledge base, questions store, and execution logs.

7. Documents are generated
   - After the analysis agents finish, document-generation stages produce the key outputs.
   - These include the FRD, user stories, technical architecture, database design, API spec, and scope of work.
   - The compiler combines the generated artifacts into a cohesive final document.

8. Real-time progress is shown to the user
   - The backend emits WebSocket events such as agent activity, status changes, and knowledge updates.
   - The frontend updates the workspace UI in real time so the user can follow progress.

9. User can intervene or re-run parts of the workflow
   - The user can pause, resume, cancel, regenerate from a specific agent, or recompile the document.
   - These actions allow the system to refine or rebuild parts of the output without restarting everything.

10. Final result is delivered
   - The project completes with generated documents and structured analysis artifacts.
   - The user can review, refine, and continue improving the project from the dashboard or workspace.

In short, the complete pipeline is:

User idea → frontend submission → backend project creation → DAG workflow orchestration → parallel/staged AI agents → validation and persistence → document generation → real-time UI updates → final deliverables.
