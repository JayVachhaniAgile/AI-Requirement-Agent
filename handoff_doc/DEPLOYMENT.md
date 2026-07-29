# DEPLOYMENT.md — Deploy / CI / Infra Reference

## Prerequisites

- Node.js ≥18
- PostgreSQL (local or cloud)
- `DATABASE_URL` configured
- LLM API key (`GROQ_API_KEY` or `OPENAI_API_KEY`)

## Local Development Setup

### 1. Clone and install

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/backend/.env.example apps/backend/.env
# Edit .env with your DATABASE_URL and API keys
```

### 3. Start backend

```bash
cd apps/backend
pnpm run dev
# Server starts on http://localhost:3000
```

### 4. Start frontend

```bash
cd apps/frontend
pnpm run dev
# Vite dev server starts on http://localhost:5173 (or configured port)
```

### 5. Database

- TypeORM `synchronize: true` auto-creates tables in development
- No manual migrations required for dev
- Never use `synchronize: true` in production without migrations

## Production Build

```bash
# Build backend
cd apps/backend
pnpm run build

# Build frontend
cd apps/frontend
pnpm run build
```

### Build Output

| Package | Output |
|---|---|
| Backend | `apps/backend/dist/` |
| Frontend | `apps/frontend/dist/` |

## Environment Variables (Production)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Default 3000 |
| `NODE_ENV` | Yes | Set to `production` |
| `LLM_PROVIDER` | Yes | `groq` or `openai` |
| `GROQ_API_KEY` | If using Groq | |
| `GROQ_MODEL` | No | Default `llama-3.3-70b-versatile` |
| `OPENAI_API_KEY` | If using OpenAI | |
| `OPENAI_MODEL` | No | Default `gpt-4o` |

## Docker (Planned)

No Docker configuration exists yet. This is a TODO item.

## CI/CD

No CI/CD pipeline is configured. This is a TODO item.

**When CI is added:**
- Add to `DEPLOYMENT.md` § CI gates
- Add exact commands to `SMOKE_TESTS.md` § CI gates

## Health Check

```bash
curl http://localhost:3000/api/healthz
# Expected: { "status": "ok", ... }
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED` on DB | PostgreSQL not running | Start PostgreSQL |
| `401` from LLM API | API key missing or invalid | Check `.env` |
| WebSocket reconnecting | CORS misconfiguration | Ensure `origin: true` in gateway |
| Tables not created | `NODE_ENV=production` + no migrations | Run migrations or set `NODE_ENV=development` |
