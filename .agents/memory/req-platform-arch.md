---
name: AI Requirements Platform Architecture
description: Key decisions and gotchas for the req-platform full-stack app in this monorepo.
---

## Stack
- Frontend: `artifacts/req-platform` — React+Vite, Space Grotesk + JetBrains Mono, orange (#FF6600) "Blueprint Precision" theme
- Backend: `artifacts/api-server` — Express, Drizzle ORM, pnpm workspace, esbuild bundler
- AI: OpenAI `gpt-4o` via `OPENAI_API_KEY` secret; model overrideable via `OPENAI_MODEL` env var
- DB: Replit Postgres, Drizzle schema in `lib/db/src/schema/`

## Agent Pipeline (sequential, in-process)
1. DISCOVERY → `agents/discovery.ts`
2. BUSINESS_ANALYSIS → `agents/business-analyst.ts`
3. PRODUCT_ANALYSIS → `agents/product-manager.ts`
4. REQUIREMENTS_ENGINEERING → `agents/requirements-engineer.ts`
5. VALIDATION → `agents/critic.ts`
6. COMPILATION → `agents/compiler.ts`

Orchestrator: `src/orchestrator/workflow.ts` — runs via `setImmediate` (fire-and-forget from POST /start).
Cancellation: checked before each stage by reading `project.status === 'CANCELLED'` from DB.

## Key Gotchas
- `@workspace/db` package.json exports point directly to `.ts` source — esbuild resolves fine at runtime, but `tsc --noEmit` typecheck fails on project references because there are no compiled `.d.ts` files. Runtime is correct; ignore typecheck errors for db imports.
- `desc()` from `drizzle-orm` must be used for ordering — do NOT use the `sql` template tag for ORDER BY (causes runtime ReferenceError if `sql` isn't imported).
- All agent outputs use Zod validation before persisting — schema mismatch throws and marks project FAILED.
- `response_format: json_object` used for structured agents; `generateText` used for the compiler (markdown output).
- `relatedIds` stores external IDs (e.g. "BR-001"), not DB UUIDs — intentional for traceability.

**Why no Redis/BullMQ:** Replit environment is ephemeral; in-process `setImmediate` + DB state is reliable enough for MVP.
