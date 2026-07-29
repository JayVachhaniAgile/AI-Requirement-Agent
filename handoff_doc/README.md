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

Create `apps/backend/.env`:

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
cd apps/backend && pnpm run dev

# Terminal 2: Frontend
cd apps/frontend && pnpm run dev
```

Open `http://localhost:5173` (Vite default).

## Architecture Summary

| Component | Technology | Location |
|---|---|---|
| Backend | NestJS (TypeScript) | `apps/backend/` |
| Frontend | React + Vite | `apps/frontend/` |
| Database | PostgreSQL via TypeORM | `apps/backend/src/database/` |
| API Client | Generated React Query hooks | `lib/api-client-react/` |
| Real-time | Socket.IO | `apps/backend/src/realtime/` |

## Project Structure

```
apps/backend/src/
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

apps/frontend/src/
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
```
