# AGENTS.md — AI-Agent Handoff Entry Point

> **Read first.** This doc tells you what you need before you start coding.

## Project Identity

| Field | Value |
|---|---|
| Name | Crystallize |
| Description | Multi-agent AI system that ingests a software idea and produces a complete requirements document via a 14-agent sequential pipeline |
| Handoff root | `handoff_doc/` |
| Repo structure | Monorepo — Nx workspace with pnpm |
| Status | Active development |

## Read Order

1. **`AGENTS.md`** (this file) — entry point, read order, agent rules
2. **`CONTEXT.md`** — full technical context, architecture, directories, routes, env vars, bug history
3. **`README.md`** — operational runbook (setup, env, troubleshooting)
4. **`DATA_MODEL.md`** — database entities, relationships, example shapes
5. **`WORKFLOW_RULES.md`** — state machine, pipeline stages, agent orchestration
6. **`LLM_CONTRACTS.md`** — LLM provider config, agent prompts, output schemas
7. **`DEPLOYMENT.md`** — deploy flow, CI, infrastructure
8. **`ROADMAP.md`** — feature status matrix
9. **`BACKLOG.md`** — prioritized backlog
10. **`SMOKE_TESTS.md`** — manual + CI verification

## Agent Rules (CRITICAL)

1. **Read before write** — always read AGENTS.md first, then CONTEXT.md before touching code
2. **No hallucination** — if the docs don't mention a route, env var, or config, it doesn't exist. Never invent
3. **File paths** — all paths are relative to monorepo root unless prefixed with `apps/frontend/` or `apps/backend/`
4. **Frontend patterns** — ShadCN/ui components in `apps/frontend/src/components/ui/`, pages in `apps/frontend/src/pages/`
5. **Backend patterns** — NestJS modules in `apps/backend/src/`, entities in `database/entities/`, controllers follow RESTful conventions
6. **State management** — React Query for server state, no Redux or Zustand; `useProjectSocket` for real-time events
7. **API prefix** — all backend routes are prefixed with `/api`
8. **Status keys** — `done` · `stub/partial` · `not started` · `blocked` · `cancelled` · `deferred`

## Quick Links

| Resource | Path |
|---|---|
| Backend src | `apps/backend/src/` |
| Frontend src | `apps/frontend/src/` |
| API client library | `lib/api-client-react/` |
| DB schema | `lib/db/src/schema/` |
| Dashboard page | `apps/frontend/src/pages/dashboard.tsx` |
| Project workspace | `apps/frontend/src/pages/projects/[id].tsx` |
| Root App | `apps/frontend/src/App.tsx` |

## Cross-Reference

| Topic | Doc |
|---|---|
| API routes | [CONTEXT.md §4](CONTEXT.md#4-backend-api-routes) |
| Database schema | [DATA_MODEL.md](DATA_MODEL.md) |
| Environment variables | [CONTEXT.md §6](CONTEXT.md#6-environment-variables) |
| Agent pipeline | [WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| LLM integration | [LLM_CONTRACTS.md](LLM_CONTRACTS.md) |
| Setup instructions | [README.md](README.md) |
| Deployment | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Feature status | [ROADMAP.md](ROADMAP.md) |
| Backlog | [BACKLOG.md](BACKLOG.md) |
| Verification | [SMOKE_TESTS.md](SMOKE_TESTS.md) |
