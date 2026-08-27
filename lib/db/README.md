# @workspace/db — legacy / unused

This package is a **Drizzle** scaffold that is **not** used by the running Crystallize stack.

- Backend persistence is **TypeORM** under `apps/server/src/database/`
- Stage/status enums here are stale vs the live 23-stage DAG pipeline

Do not add new dependencies on this package. Shared pipeline identity lives in `@workspace/pipeline-config`; shared DTOs in `@workspace/shared-types`.
