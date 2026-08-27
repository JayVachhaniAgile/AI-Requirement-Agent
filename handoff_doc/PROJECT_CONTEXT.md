# PROJECT_CONTEXT.md — Project Context Service Design & Implementation

> Centralized shared context for the Crystallize AI Requirements Engineering Platform.
> Every AI agent reads and writes to this service instead of passing outputs directly to each other.

## Status

| Aspect | Status |
|---|---|
| Module scaffold | **done** |
| REST + SSE API | **done** |
| Commit-based writes with optimistic locking | **done** |
| Conflict resolver (pure logic) | **done** |
| Domain mapping (16 domains) | **done** |
| Backfill from legacy `knowledge_items` | **done** |
| Consumer digest (AGENT_DIGEST_CONFIG tiering) | **done** |
| Delta event stream (RxJS Subject) | **done** |
| Unit specs (context-domains + conflict-resolver) | **done** |
| Legacy `RkbService` adapter (domain column + population) | **done** |
| Wired into `AppModule` | **done** |
| Agent prompt assembly via PCS (replacing direct reads) | **not started** |
| Socket.io real-time context events | **not started** |

## Architecture

```
Agents (14 structured + 6 doc + gap-analysis)
        |
        v
+---------------------------------------------------------+
|              ProjectContextService                      |
|  +-------------+  +--------------+  +---------------+   |
|  | applyCommit |  |  getView     |  |  getDigest    |   |
|  | (atomic)    |  |  (filtered)  |  |  (tiered)     |   |
|  +------+------+  +------+-------+  +-------+-------+   |
|         |                |                   |          |
|  +------v------+  +------v-------+  +-------v--------+  |
|  | Conflict    |  | ProjectContext|  | Subscription   |  |
|  | Resolver    |  | Item/Snapshot |  | EventsService  |  |
|  | (optimistic |  | Commit tables |  | (RxJS Subject) |  |
|  |  locking +  |  |               |  |                |  |
|  |  ownership) |  |               |  |                |  |
|  +-------------+  +--------------+  +----------------+  |
+---------------------------------------------------------+
        |
        v
PostgreSQL (TypeORM + synchronize: true in dev)
```

### Module layout

```
apps/server/src/project-context/
|-- context-domains.ts                  # 16 canonical domains, type mapping, agent consumption
|-- conflict-resolver.ts                # Pure functions: resolveChanges()
|-- project-context-events.service.ts   # RxJS delta stream (SSE + future WS)
|-- project-context.service.ts          # Core CRUD, commits, versioning, backfill
|-- project-context.controller.ts       # REST + SSE endpoints
|-- context-domains.spec.ts             # Unit tests for domain mapping
|-- conflict-resolver.spec.ts           # Unit tests for conflict rules
`-- project-context.module.ts           # NestJS module wiring
```

## Data Model

### `project_context_items` (live working value)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Stable identity across versions |
| `project_id` | uuid | |
| `domain` | varchar(64) | One of 16 canonical domains |
| `external_id` | varchar(100) | Agent-assigned cross-ref (nullable for legacy backfill rows) |
| `type` | varchar(100) | Sub-type within domain |
| `title` | text | |
| `body` | text nullable | Domain-specific content |
| `producer_agent` | varchar(100) nullable | Agent key that last wrote it |
| `status` | varchar(32) | `DRAFT` \| `ACTIVE` \| `SUPERSEDED` \| `FLAGGED` |
| `version` | int | Monotonic per item id |
| `related_ids` | text[] | References to other item ids |
| `metadata` | text nullable | JSON string (evidence, confidence, reasoning, sourceCategory) |
| `created_at` / `updated_at` | timestamptz | |

### `project_context_snapshots` (immutable history)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid | |
| `project_id` | uuid | |
| `version` | int | Version captured |
| `snapshot_json` | text | Full serialized item at that version |
| `change_summary` | text nullable | Human-readable what/why |
| `commit_id` | uuid nullable | Links to the commit log |
| `trigger_event` | varchar(64) nullable | `context_update` \| `context_supersede` \| `context_delete` |
| `created_at` | timestamptz | |

### `project_context_commits` (append-only audit trail)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK (commit id) | |
| `project_id` | uuid | |
| `actor_key` | varchar(100) nullable | Agent key or user id |
| `actor_type` | varchar(32) | `agent` \| `user` \| `system` |
| `change_type` | varchar(32) | `CREATE` \| `UPDATE` \| `SUPERSEDE` \| `DELETE` \| `MIXED` \| `BACKFILL` \| `NOOP` |
| `affected_item_ids` | text[] | |
| `reason` | text nullable | |
| `metadata` | text nullable | JSON: prompt/schema versions, conflict outcome |
| `created_at` | timestamptz | |

### Legacy `knowledge_items` (extended)

Added `domain varchar(64) nullable` column, populated by `RkbService.saveKnowledgeItems()` via `domainForType(item.type)`. The backfill endpoint seeds `project_context_items` from these legacy rows.

## 16 Canonical Domains

| Domain | Key legacy types |
|---|---|
| `business_goals` | BUSINESS_GOAL, BUSINESS_OBJECTIVE, PRODUCT_VISION, SUCCESS_METRIC, VALUE_PROPOSITION, USER_GOAL |
| `functional_requirements` | FUNCTIONAL_REQUIREMENT, BUSINESS_REQUIREMENT, BUSINESS_RULE |
| `non_functional_requirements` | PERFORMANCE_TEST, COMPLIANCE_NOTE, SECURITY_AUTH, SECURITY_COMPLIANCE, SECURITY_ENCRYPTION, SECURITY_REPORT, API_SECURITY |
| `assumptions` | ASSUMPTION, RISKY_ASSUMPTION |
| `constraints` | CONSTRAINT, SCOPE, MVP_SCOPE, DB_CONSTRAINT |
| `risks` | RISK, BUSINESS_RISK, RESEARCH_RISK, ESTIMATION_RISK, THREAT_MODEL |
| `decisions` | DATABASE_DESIGN, DATA_DICTIONARY, DB_TABLE, DB_INDEX, DB_RELATIONSHIP, API_SPEC, INFRASTRUCTURE, DEPLOYMENT, EVENT_FLOW, TECHNOLOGY_SUGGESTION, LLM_SELECTION, EMBEDDING_DESIGN, VECTOR_STORE, PROMPT_STRATEGY, AI_MEMORY, AI_ARCHITECTURE |
| `questions` | QUESTION |
| `glossary` | GLOSSARY_TERM |
| `stakeholders` | STAKEHOLDER |
| `features` | FEATURE, MODULE |
| `personas` | PERSONA, USER_TYPE |
| `user_stories` | USER_STORY |
| `acceptance_criteria` | ACCEPTANCE_CRITERIA |
| `domain_knowledge` | CONFIRMED_FACT, DISCOVERY_SUMMARY, BA_SUMMARY, RESEARCH_SUMMARY, INDUSTRY_STANDARD, COMPETITOR, API_RESEARCH, DOMAIN_KNOWLEDGE |
| `document_summaries` | FRD_DOCUMENT, USER_STORIES_DOCUMENT, TECH_ARCH_DOCUMENT, DB_DESIGN_DOCUMENT, API_SPEC_DOCUMENT, SOW_DOCUMENT, COMPILED_DOCUMENT, DOCUMENT_SUMMARY |

## Versioning

- **Per-item version counter** (`version` column). Every mutation (create/update/supersede/delete) bumps it.
- **Immutable snapshots** in `project_context_snapshots` are written *before* every mutation to an existing item. Creation (version 1) does not produce a snapshot — matching the existing per-document versioning philosophy ("Version 1 initial, no extra versions").
- **Regeneration** is a `supersede` operation: bumps the item version, transfers ownership to the regenerating agent, and keeps a snapshot of the previous value.
- **Gap-analysis Apply** is a `supersede` (in-place update, no new version number — same semantics as today's `saveDocument(..., { createVersion: false })`).
- **Backfill** seeds items at version 1 with a single `BACKFILL` commit log row.

## APIs

All routes are under `projects/:projectId/context` (global prefix `api`).

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Domain-filtered live view (SUPERSEDED excluded by default). Query: `?domains=a,b&includeSuperseded=true&updatedSince=ISO` |
| `GET` | `/digest?consumerAgent=x&domains=a,b` | Consumer-specific digest with AGENT_DIGEST_CONFIG tiering |
| `GET` | `/domains` | Supported domains + per-domain counts |
| `GET` | `/items/:domain/:externalId?version=N` | Single item (or immutable snapshot at version N) |
| `GET` | `/versions?itemId=…&domain=…&externalId=…` | Snapshot history |
| `GET` | `/commits?limit=50&before=ISO` | Append-only audit log |
| `POST` | `/commits` | Atomic commit (optimistic lock + ownership rules) |
| `POST` | `/backfill` | Seed `project_context_items` from legacy `knowledge_items` (idempotent) |
| `GET` | `/stream` | SSE delta stream for this project |

### Commit body

```json
{
  "actorKey": "requirements-engineering",
  "actorType": "agent",
  "changes": [
    {
      "domain": "functional_requirements",
      "operation": "upsert",
      "externalId": "FR-7",
      "expectedVersion": 3,
      "item": { "type": "FUNCTIONAL_REQUIREMENT", "title": "…", "body": "…", "status": "ACTIVE" },
      "reason": "generated by requirements-engineering stage"
    }
  ],
  "reason": "requirements-engineering stage output",
  "metadata": { "promptVersion": "v3", "schemaVersion": "abc123" }
}
```

### Commit response (success)

```json
{
  "commitId": "…",
  "changeType": "UPDATE",
  "applied": 1,
  "items": [{ "domain": "functional_requirements", "externalId": "FR-7", "operation": "update", "version": 4 }],
  "conflicts": []
}
```

### Commit response (conflict — 409)

```json
{
  "error": "context_conflict",
  "conflicts": [{ "domain": "functional_requirements", "externalId": "FR-7", "code": "version_conflict", "currentVersion": 5, "expectedVersion": 3, "producerAgent": "product-analysis" }],
  "hint": "re-fetch the context view and retry with fresh expectedVersion values"
}
```

## Context Update Strategy

1. **Domain relevance** — each agent declares the domains it consumes in `AGENT_CONSUMED_DOMAINS` (`context-domains.ts`).
2. **Detail tiering** — `GET /digest` applies `AGENT_DIGEST_CONFIG` (full for immediate upstream, `externalId + title + one-line` for the rest). Unknown consumers receive everything full.
3. **State overlay** — `SUPERSEDED` excluded by default; `FLAGGED` included but read-only to agents.
4. **Ordering pressure** — pipeline order lock (`assertNoForwardReferences()`) governs which agents may insert new items. Any agent may update its own produced items or supersede foreign items.
5. **Write batching** — each agent's entire `AgentResult` is submitted as one atomic commit. The commit log records `prompt_version`/`schema_version` (P2-4 traceability).
6. **Regeneration** — `supersede` operation on the targeted items, bumping versions and transferring ownership. Previous values preserved in snapshots.

## Conflict Resolution

### Rule set (implemented in `conflict-resolver.ts`)

1. **Optimistic locking** — each change carries an optional `expectedVersion`. If the live item has moved past it, the change is rejected with `version_conflict`. The workflow supervisor re-fetches the digest and re-prompts the agent (reuses P0-2 retry-with-feedback loop).
2. **Single-writer-per-stage** — the pipeline lock already ensures one structured agent runs at a time per project. This is the strongest guarantee; most of the time `expectedVersion` matches.
3. **Ownership + provenance** — an agent may freely update items it produced (`producerAgent === actor.key`). Items produced by other agents may only be `supersede`d (with `reason` + `relatedIds`). Unattributed stealth edits are rejected.
4. **FLAGGED items** — read-only for agents; only `user`/`system` actors may touch them. Prevents agents from clobbering an explicit stakeholder decision.
5. **Idempotent retries** — `create` on an existing item by the same producer with a matching `expectedVersion` is a safe no-op. `delete` on a missing item is a no-op.
6. **Deterministic resolution** — when both sides write concurrently (rare — requires parallel execution), the first commit wins; the second gets `version_conflict`. The commit log records the conflict outcome for audit.

## Best Practices (implementation notes)

1. **Move read-model assembly out of agents** — `GET /digest` centralizes the domain filtering + detail tiering that currently lives in each agent's prompt assembly.
2. **Don't break existing contracts** — `RkbService` remains the legacy path; the new `project_context_items` table is additive, and backfill seeds it from legacy data.
3. **Version the schema alongside the schema** — every commit logs `prompt_version`/`schema_version` in `metadata` for P2-4 traceability.
4. **Never load the full project context** — always query with domain + consumer filters; the digest endpoint applies token caps centrally.
5. **Snapshots are cheap; deletes are not** — `SUPERSEDED` status preserves history; hard delete is never used.
6. **Emit deltas, don't re-read** — `ProjectContextEventsService` publishes one delta per mutation. The SSE endpoint (`/stream`) streams them to the UI; socket.io wiring is a future step.
7. **Idempotency via `domain + externalId`** — retries are safe no-ops when `expectedVersion` already reflects the write.
8. **Document new domains** — when introducing new item types, update `DOMAIN_TYPES` in `context-domains.ts` and `handoff_doc/DATA_MODEL.md`.
9. **Guard frozen/stale context** — `FLAGGED` items block agent writes until a user decision is applied (mirrors gap-analysis Apply gating).
10. **Security** — context is the single source of truth; the future auth module (A1) will gate `/context` endpoints. `metadata` evidence is untrusted LLM output — validate before returning to the UI.

## Backfill

`POST /api/projects/:id/context/backfill` seeds `project_context_items` from legacy `knowledge_items` using the `DOMAIN_TYPES` mapping. Items already present (by `domain + externalId`) are skipped (idempotent). Legacy rows without an `externalId` get `LEGACY-<knowledgeItemId>` as their key. The operation is recorded as a single `BACKFILL` commit log row.

## Migration Notes

- `synchronize: true` in development auto-creates the three new tables and adds the `domain` column to `knowledge_items`.
- Production will need a migration once `NODE_ENV=production` (currently no migration pipeline exists — see BACKLOG A2).
- Rollback: drop the three `project_context_*` tables and remove the `domain` column; `knowledge_items` behavior is unchanged.

## Future Work

- Wire `ProjectContextEventsService` into `ProjectsGateway` for real-time WS events (`context.updated`).
- Replace agent prompt assembly's direct `RkbService.getKnowledgeContext()` calls with `GET /context/digest`.
- Add `GET /context/diff` for side-by-side version comparison (mirrors the existing document version diff viewer).
- Add `PATCH /context/items/:domain/:externalId` for single-item targeted writes (human-in-the-loop edits).
- Migrate all agents to write through `POST /context/commits` instead of `RkbService.saveKnowledgeItems()`.
