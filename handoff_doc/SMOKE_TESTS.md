# SMOKE_TESTS.md — Manual E2E Verification Checklist

> Pre-merge verification steps and known failure modes.

## Prerequisites

- Backend running on `http://localhost:3000`
- Frontend running on `http://localhost:5173`
- PostgreSQL running with test database
- At least one LLM API key configured (Groq or OpenAI)

## §0 CI Gates

No CI pipeline exists yet. When added, add the following:

```bash
# Backend
cd apps/backend && pnpm run build && pnpm run test

# Frontend
cd apps/frontend && pnpm run build
```

## §1 Health Check

```bash
curl http://localhost:3000/api/healthz
```

**Expected:** HTTP 200 with `{"status": "ok"}` or similar.

## §2 Project Creation

```bash
# Create a project
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "idea": "A simple task management app with user authentication, task CRUD, and due date reminders."}'
```

**Expected:** HTTP 201 with project object including `id`, `status: "CREATED"`.

## §3 Project Listing

```bash
curl http://localhost:3000/api/projects
```

**Expected:** HTTP 200 with array of projects including the one created above.

## §4 Project Workspace (Dashboard API)

```bash
# Replace PROJECT_ID with actual ID from §2
curl http://localhost:3000/api/projects/PROJECT_ID/dashboard
```

**Expected:** HTTP 200 with dashboard snapshot including `status`, `steps`, `documentStats`.

## §5 Start Workflow

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/start
```

**Expected:** HTTP 200, project status changes to `DISCOVERING` then progresses through stages.

## §6 Clarification Questions

```bash
curl http://localhost:3000/api/projects/PROJECT_ID/questions
```

**Expected:** HTTP 200 with array (may be empty if no questions asked).

## §7 Document Retrieval

```bash
# After workflow completes (status COMPLETED)
curl http://localhost:3000/api/projects/PROJECT_ID/document
```

**Expected:** HTTP 200 with document object containing `markdownContent`.

## §7b Multi-Document Retrieval

```bash
# List all documents by type
curl http://localhost:3000/api/projects/PROJECT_ID/documents

# Get specific document type
curl http://localhost:3000/api/projects/PROJECT_ID/documents/FRD_DOCUMENT
curl http://localhost:3000/api/projects/PROJECT_ID/documents/USER_STORIES_DOCUMENT
curl http://localhost:3000/api/projects/PROJECT_ID/documents/TECH_ARCH_DOCUMENT
curl http://localhost:3000/api/projects/PROJECT_ID/documents/DB_DESIGN_DOCUMENT
curl http://localhost:3000/api/projects/PROJECT_ID/documents/API_SPEC_DOCUMENT
```

**Expected:** HTTP 200 with document objects, each containing `markdownContent` and `documentType`.

## §8 Validation Issues

```bash
curl http://localhost:3000/api/projects/PROJECT_ID/validation
```

**Expected:** HTTP 200 with array of validation issues.

## §8a Knowledge by Agent

```bash
# Get knowledge items for a specific agent (e.g., discovery)
curl http://localhost:3000/api/projects/PROJECT_ID/knowledge/by-agent/discovery
```

**Expected:** HTTP 200 with array of knowledge items for that agent.

## §8b Pause Workflow

```bash
# Only works while workflow is running
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/pause
```

**Expected:** HTTP 200, project status changes to `PAUSED`.

## §8c Regenerate from Agent

```bash
# Re-run from a specific agent onwards (e.g., requirements-engineering)
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/regenerate/requirements-engineering
```

**Expected:** HTTP 200, project restarts from REQUIREMENTS_ENGINEERING stage.

## §9 Settings

```bash
# Get pipeline defaults
curl http://localhost:3000/api/settings/pipeline

# Update pipeline defaults
curl -X PUT http://localhost:3000/api/settings/pipeline \
  -H "Content-Type: application/json" \
  -d '{"autoResumeOnFailure": "true", "theme": "dark"}'
```

**Expected:** HTTP 200 with updated settings object.

## §10 Aggregate Endpoints

```bash
curl http://localhost:3000/api/aggregate/requirements
curl http://localhost:3000/api/aggregate/validation
curl http://localhost:3000/api/aggregate/documents
curl http://localhost:3000/api/aggregate/analytics
curl http://localhost:3000/api/aggregate/workflow
```

**Expected:** HTTP 200 for all.

## §11 WebSocket (Manual Test)

1. Open browser dev tools → Network → WS
2. Navigate to a project workspace
3. Verify WebSocket connection established to `/projects` namespace
4. Start a workflow and observe `agentActivity` events in Network tab

## §12 Frontend Smoke Test (Manual)

1. Open `http://localhost:5173`
2. Dashboard loads with project cards (or empty state)
3. Click "New Project" → form opens
4. Submit project → redirected to workspace
5. Click "Start Analysis" → workflow tabs show progress
6. Toggle theme (sun/moon icon) → dark/light mode switches
7. Click "AI Workflow" → blueprint page loads
8. Click "Validation" → validation hub loads

## Known Failure Modes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED` on health check | Backend not running | Start backend with `pnpm run dev` |
| Empty dashboard | No projects exist | Create a project via form or API |
| Workflow stuck at `DISCOVERING` | LLM API key missing/invalid | Check `.env` for API key |
| WebSocket showing "polling fallback" | CORS or proxy issue | Check `origin: true` in gateway config |
| Document not generated | Workflow didn't reach COMPLETED | Check project status, review execution logs |
| Theme not persisting | Backend save race condition | Fixed in latest version; clear localStorage if still occurring |
| Slow LLM responses | Groq rate limits | Reduce input size or switch to OpenAI |
| TypeScript build error | Drifted generated types | Run `pnpm codegen` in `lib/api-client-react/`
