# AGENTS.md — Project Context for AI Assistants

> **Read this first.** This file must be read at the start of every new session before any code changes are made.

## Required Reading Order

Before writing any code, reading any file, or making any plan, read these documents in order:

1. **`handoff_doc/CONTEXT.md`** — Architecture overview, API endpoints, WebSocket events, environment variables, conventions
2. **`handoff_doc/WORKFLOW_RULES.md`** — Pipeline state machine, agent orchestration, pause/resume/regenerate flows
3. **`handoff_doc/DATA_MODEL.md`** — Database entities, relationships, column details
4. **`handoff_doc/LLM_CONTRACTS.md`** — Agent output schemas, Zod validation, `externalId` handling
5. **`handoff_doc/ROADMAP.md`** — Feature status matrix (what's done vs not started)
6. **`handoff_doc/SMOKE_TESTS.md`** — Manual verification checklist and known failure modes
7. **`handoff_doc/BACKLOG.md`** — Prioritized backlog (if implementing new features)
8. **`handoff_doc/DEPLOYMENT.md`** — Deploy/CI infrastructure reference
9. **`handoff_doc/README.md`** — Operational runbook, quick start

## Why This Exists

This project has specific architectural decisions, known pitfalls, and a carefully designed pipeline. Reading these documents prevents:

- Breaking the 15-agent sequential pipeline
- Introducing Zod schema validation errors
- Misunderstanding the pause/regenerate state machine
- Duplicating existing functionality
- Using wrong column names or entity patterns
- Breaking WebSocket event contracts

## Project Identity

- **Name:** Crystallize
- **Stack:** NestJS backend (TypeORM + PostgreSQL), React + Vite frontend (Tailwind CSS + ShadCN/ui)
- **Monorepo:** pnpm workspaces + Nx, `apps/backend/`, `apps/frontend/`, `lib/`
- **Pipeline:** 15 sequential AI agents that produce a compiled requirements document
- **Key constraint:** Do not modify `lib/api-client-react/src/generated/` — these are orval-generated files

## Session Rules

- Always read these docs before making changes
- Keep `handoff_doc/` updated when adding new features or changing architecture
- When adding new API endpoints, update `CONTEXT.md` endpoint table
- When changing agent behavior, update `WORKFLOW_RULES.md` and `LLM_CONTRACTS.md`
- When changing the data model, update `DATA_MODEL.md`
- Do not duplicate documentation — cross-reference instead
