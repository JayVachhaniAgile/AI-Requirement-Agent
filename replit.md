# AI Software Engineering Platform

Autonomous multi-agent system that turns a business idea into a complete software engineering documentation package.

## Run & Operate

- `pnpm install` — install workspace dependencies
- `pnpm run dev:backend` — NestJS API (`apps/server`, port 3000)
- `pnpm run dev:frontend` — React/Vite UI (`apps/client`, port 5173)
- `pnpm run typecheck` — typecheck across NX projects
- `pnpm run build` — build all NX projects
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `OPENAI_API_KEY` — LLM provider key

Legacy Replit artifacts (still present during migration):

- `pnpm --filter @workspace/api-server run dev` — Express API (port 5000)
- `pnpm --filter @workspace/req-platform run dev` — original frontend

## Stack

- pnpm workspaces + NX monorepo
- Frontend: React 19 + Vite + Tailwind (`apps/client`)
- Backend: NestJS + TypeORM (`apps/server`)
- Shared types: `libs/shared-types`
- Legacy shared libs: `lib/db` (Drizzle), `lib/api-zod`, `lib/api-client-react`
- Database: PostgreSQL

## Where things live

- `apps/server` — NestJS API, agents, workflow orchestrator
- `apps/client` — React UI (migrated from `artifacts/req-platform`)
- `libs/shared-types` — shared DTOs/interfaces
- `artifacts/api-server` — original Express API (source of truth during migration)
- `artifacts/req-platform` — original React UI (kept for reference)

## Architecture decisions

- NestJS replaces Express for the NX backend; agent pipeline logic is ported 1:1.
- TypeORM entities mirror the existing Drizzle schema for a gradual cutover.
- Frontend continues to use `@workspace/api-client-react` (OpenAPI-generated hooks).
- Workflow currently runs in-process (`setImmediate`); BullMQ/Redis is planned next per PRD.
