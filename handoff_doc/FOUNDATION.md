# FOUNDATION.md — New Architecture Foundation (Phase 1)

> Additive foundation for the target architecture. Does **not** change the
> existing 21-agent pipeline, its data model, or its execution flow. All new
> tables and endpoints are namespaced under `foundation/` and are safe to run
> alongside the legacy modules.

## Status

| Component | Status |
|---|---|
| Entities (9 new tables) | **done** |
| Pure logic (graph, gates, router, pricing) | **done** |
| Services (9) | **done** |
| REST controllers (`/api/foundation/...`) | **done** |
| Wiring into `AppModule` + TypeORM registry | **done** |
| Unit tests (6 spec files) | **done** |
| Existing agent flow migration | **not started** (Phase 2+) |

## Concepts → Implementation

| Concept | Service | Table(s) |
|---|---|---|
| Project | `ProjectVersionService` (new) | `projects` (existing) + `project_versions` |
| Project Knowledge | `ProjectKnowledgeService` | `knowledge_items` (existing) |
| Canonical Project Model | `ProjectVersionService.createVersion` | `project_versions.snapshot_json` |
| Context Engine | `ContextEngineService` | reads `projects` + `knowledge_items` |
| Artifact | `ArtifactRegistryService` | `artifacts` |
| Artifact Dependency | `ArtifactRegistryService` + `artifact-graph.ts` | `artifact_dependencies` |
| Agent Skill | `AgentSkillRegistryService` | `agent_skills` |
| Agent Execution | `WorkflowExecutionService.startSkillExecution` | `agent_skill_executions` |
| Workflow | `WorkflowExecutionService` | `workflow_executions` |
| Quality Gate | `QualityGateService` | `quality_checks` |
| Model Router | `ModelRouterService` | (config/env driven) |
| Token/Cost tracking | `ModelUsageService` | `model_usage` |

## New Tables

`project_versions`, `artifacts`, `artifact_versions`, `artifact_dependencies`,
`agent_skills`, `agent_skill_executions`, `workflow_executions`,
`quality_checks`, `model_usage`.

- Created by TypeORM `synchronize: true` in dev (same as all other tables).
- Every AI-generated artifact row carries `project_id`, `type`, `version`,
  `status`, `created_at`, `updated_at`, `created_by`, `source`,
  `source_version`, `confidence`, `metadata`.
- No graph database introduced — `artifact_dependencies` is relational and
  traversal is BFS in application code (`artifact-graph.ts`).

## REST API (`/api/foundation/...`)

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/foundation/projects/:projectId/versions` | List / create project version |
| GET | `/foundation/projects/:projectId/versions/:version` | Fetch one version |
| GET/POST | `/foundation/projects/:projectId/knowledge` | List / count knowledge (digest) |
| GET | `/foundation/projects/:projectId/knowledge/digest` | Canonical digest |
| POST | `/foundation/context/:projectId/build` | Build context bundle |
| GET/POST | `/foundation/projects/:projectId/artifacts` | List / upsert artifacts |
| GET | `/foundation/projects/:projectId/artifacts/plan` | Dependency layers |
| GET | `/foundation/projects/:projectId/artifacts/:artifactId` | Fetch artifact |
| POST | `/foundation/artifacts/:artifactId/versions` | Publish new version |
| GET | `/foundation/artifacts/:artifactId/versions` | Version history |
| GET/POST | `/foundation/projects/:projectId/dependencies` | Dependency edges |
| GET | `/foundation/projects/:projectId/artifacts/:artifactId/impact` | Impact report |
| GET/POST | `/foundation/skills` | Skill registry |
| POST | `/foundation/skills/:key/enable` / `disable` | Toggle skill |
| POST | `/foundation/orchestration/workflows` | Start workflow execution |
| POST | `/foundation/orchestration/workflows/:id/complete` | Complete workflow |
| GET | `/foundation/orchestration/workflows/:projectId` | List workflows |
| POST | `/foundation/orchestration/skill-executions` | Start skill execution |
| POST | `/foundation/orchestration/skill-executions/:id/complete` | Complete skill execution |
| GET | `/foundation/orchestration/skill-executions/:workflowExecutionId` | List skill runs |
| GET | `/foundation/quality/gates` | List gates |
| POST | `/foundation/quality/run/:projectId` | Run quality gates |
| GET | `/foundation/quality/project/:projectId` | Gate history |
| POST | `/foundation/models/route` | Resolve model route |
| POST | `/foundation/observability/usage` | Record model usage |
| GET | `/foundation/observability/usage/:projectId/summary` | Usage summary |

## Compatibility

- Legacy tables, entities, services, WebSocket events and endpoints untouched.
- `agent_executions` (legacy) and `agent_skill_executions` (new) coexist.
- `documents` / `knowledge_items` remain the runtime source of truth for the
  existing pipeline; the new artifact registry is additive.
- No changes to `lib/api-client-react/src/generated/` (orval outputs).

## Backward-Compatible Fix Included

`workflow.service.ts` bootstrap queried a non-existent `stageKey` column on
`workflow_steps` (the entity uses `stage`). Fixed to `stage` so the
gap-analysis watcher recovery path typechecks. No behavioral change to the
running pipeline.

## Tests

- `artifact-graph.spec.ts` — BFS, cycles, layers
- `quality-gates.spec.ts` — coverage / id-integrity / artifact-presence
- `model-router.spec.ts` — tier resolution, provider modes, token caps
- `model-pricing.spec.ts` — per-model cost estimation
- `model-usage.service.spec.ts` — record + aggregate summaries
- `artifact-registry.service.spec.ts` — artifact versioning, cycle rejection

Run: `pnpm --filter @workspace/server test:unit`, `pnpm --filter @workspace/server typecheck`,
`pnpm --filter @workspace/server build`, `pnpm --filter @workspace/server check:schema`.


---

## Phase 2 — Canonical Project Model

Strongly typed, validated, versioned, provenance-aware representation of every
project object. Lives in `apps/server/src/foundation/canonical/`.

### Ingestion pipeline

```
raw LLM output
   → Zod schema validation (canonical.schemas.ts)
   → normalization (canonical.normalize.ts)
   → business validation (canonical.validate.ts)
   → persistence with versioning (canonical-model.service.ts)
```

LLM output is **never** trusted directly — invalid structured output is rejected
or repaired before it touches the database.

### Kinds (22)

`project`, `project_goal`, `actor`, `domain`, `business_process`,
`requirement`, `non_functional_requirement`, `business_rule`, `assumption`,
`constraint`, `risk`, `question`, `user_story`, `acceptance_criterion`,
`entity`, `relationship`, `screen`, `api`, `security_requirement`,
`architecture_decision`, `test_case`, `estimate`, `scope_item`.

Each kind has its own Zod schema with strongly typed body fields.

### Requirements

`requirement` / `non_functional_requirement` / `security_requirement` share the
`RequirementStructured` body: classification, priority (P0–P3), actors,
preconditions, postconditions, businessRuleRefs, acceptanceCriteriaRefs,
dependencies, sourceRefs, assumptions, confidence, validationStatus.

### Source provenance

Every object carries a `provenance` envelope:

```ts
{
  epistemicClass: 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'USER_DECISION',
  sources: Array<{
    category: 'uploaded_document' | 'user_input' | 'research'
             | 'interview' | 'artifact' | 'user_decision'
             | 'ai_inference' | 'ai_assumption',
    refId?: string,
    label?: string,
    excerpt?: string
  }>,
  producedBy?: string,    // skill/agent key
  schemaVersion?: string
}
```

`GET /api/foundation/canonical/projects/:projectId/items/:kind/:externalId/provenance`
answers "where did this requirement come from?".

### Versioning

Every `canonical_items` row is unique on `(projectId, kind, externalId)`.
A save bumps `version` and writes an immutable snapshot to
`canonical_item_versions`. `GET .../versions` returns the full history.

### New tables

- `canonical_items` (JSONB payload + provenance, indexed on project/kind/status)
- `canonical_item_versions` (immutable history, unique on `(itemId, version)`)

### New REST endpoints (`/api/foundation/canonical/...`)

| Method | Path | Purpose |
|---|---|---|
| GET    | `/kinds` | List supported kinds |
| POST   | `/projects/:projectId/ingest` | Validate + persist LLM output |
| GET    | `/projects/:projectId/items` | List by kind or all |
| GET    | `/projects/:projectId/items/:kind/:externalId` | Fetch one |
| GET    | `/projects/:projectId/items/:kind/:externalId/versions` | Version history |
| GET    | `/projects/:projectId/items/:kind/:externalId/provenance` | Provenance chain |

### Tests

- `canonical.schemas.spec.ts` — Zod shape validation across kinds
- `canonical.validate.spec.ts` — business rules (FACT-without-source, ASSUMPTION high-confidence, self-relationship)
- `canonical-model.service.spec.ts` — full pipeline (validate → normalize → persist → version bump → provenance lookup)

Run via `pnpm --filter @workspace/server test:unit`.


---

## Phase 3 — Context Engine (Project Knowledge)

ONE project knowledge base → Context Engine → task-specific context → agent.
The Context Engine is responsible for building the smallest useful context
for each AI task; the complete project knowledge is **never** sent to every agent.

### Knowledge layers

1. Project Brief
2. Project Facts
3. Domain Knowledge
4. Requirements
5. Business Rules
6. Actors
7. Decisions
8. Artifacts
9. Research / Evidence
10. Source Documents
11. Open Questions
12. Assumptions

All twelve layers are reachable through the same `ContextRequest` — the engine
selects which to include based on `taskType`, `artifactTypes`, `domains`,
`artifactIds`, `evidenceRequired`, `confidenceThreshold`, and `recency`.

### Retrieval: hybrid (NOT vector-only)

- **Structured (DB)** — `canonical_items` (Phase 2) + legacy `knowledge_items`
- **Semantic / lexical** — token-overlap retrieval over descriptions + research
  text. Vector retrieval is intentionally a hook, not the primary path; the
  engine never depends on pgvector being available.

### `ContextRequest`

```ts
{
  projectId,
  agentSkill,
  taskType,
  artifactIds?,
  artifactTypes?,
  domains?,
  requiredRelationships?,
  evidenceRequired?,
  maxTokens,
  recency?,
  confidenceThreshold?
}
```

### `ContextPackage`

```ts
{
  projectSummary,
  relevantArtifacts,
  relevantEvidence,
  dependencies,
  decisions,
  assumptions,
  openQuestions,
  tokenEstimate,
  sourceReferences,
  cached,
  cacheKey,
  warnings
}
```

### Compiler pipeline

`ContextRequest → determine required info → retrieve structured → retrieve
semantic evidence → rank → dedupe → compress → enforce token budget → package`.

### Hard token budgets (configurable via env)

Defaults match the Phase 3 spec; each can be overridden by
`CONTEXT_BUDGET_<TASK>` (e.g. `CONTEXT_BUDGET_REQUIREMENTS=16000`).

| taskType      | default tokens |
|---------------|----------------|
| requirements  | 12000 |
| ux            | 8000 |
| database      | 10000 |
| security      | 8000 |
| architecture  | 12000 |
| estimation    | 6000 |
| testing       | 8000 |
| document      | 16000 |
| research      | 6000 |
| compilation   | 24000 |
| gap_analysis  | 12000 |
| discovery     | 4000 |
| validation    | 8000 |

### Relevance signals

Score blend per item (0–1):

- `taskTypeWeight` — kind × task weight table (e.g. `requirement` for
  `requirements = 1.0`, `screen = 0.6`)
- `confidence` — 0–1 from the item's confidence field
- `recency` — `1 / (1 + daysSinceUpdate / 30)`; hard 0 beyond `recency` window
- `dependencyBoost` — 1.0 if pinned via `artifactIds`, 0.5 otherwise
- `domainBoost` — 1.0 if the item kind/domain matches the request

### Caching

In-memory LRU keyed by `hash(ContextRequest) : sourceFingerprint`. Any source
version bump invalidates cached entries that reference the bumped source
via `POST /api/foundation/context/projects/:projectId/invalidate`. Maximum
128 entries by default.

### Conflict detection

When the same `externalId` is present in `canonical_items` and
`knowledge_items` with divergent summaries, the package carries a
`CONFLICTING_SOURCES` warning — call sites can route it to validation/debate.

### New REST endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/foundation/context/projects/:projectId/compile?refresh=true` | Build context package |
| POST | `/api/foundation/context/projects/:projectId/invalidate` | Invalidate cache for a source |

### Tests

- `context.ranker.spec.ts` — taskTypeWeight, recency, rankScore, dedupe
- `context.token-budget.spec.ts` — defaults, env overrides, truncate
- `context.cache.spec.ts` — key stability, source-fingerprint order-independence, LRU eviction, invalidate
- `context-engine.service.spec.ts` — retrieval, ranking, budget, cache hit, conflict detection, missing context, lexical evidence

Run via `pnpm --filter @workspace/server test:unit`.


---

## Phase 4 — Artifact Dependency Graph (First-Class Service)

The dependency graph becomes a first-class service used by Context Engine,
Orchestration Engine, Quality Gates, Impact Analysis and the Artifact
Compiler. Still built on the existing relational database — no graph DB.

### Strongly typed dependency taxonomy

`DERIVED_FROM` · `DEPENDS_ON` · `IMPLEMENTS` · `REFINES` · `CONFLICTS_WITH` ·
`VALIDATES` · `SATISFIES` · `GENERATED_FROM` · `SUPERSEDES` · `RELATED_TO`

`isDependencyType(value)` validates user input; unknown values surface as
`INVALID_DEPENDENCY_TYPES` warnings on the project graph.

### Edge schema (existing `artifact_dependencies` table)

| field             | source                                  |
|-------------------|-----------------------------------------|
| id                | existing PK                             |
| project_id        | existing FK (inherited from artifacts)  |
| source_artifact_id| existing FK                             |
| target_artifact_id| existing FK                             |
| dependency_type   | existing `relation` column              |
| weight            | existing                                |
| confidence        | new (Phase 4)                           |
| source_reference  | new (Phase 4) — pointer/label           |
| created_by        | new (Phase 4)                           |
| metadata          | existing (JSON)                         |
| created_at        | existing                                |

### Services

- `ArtifactDependencyService` — CRUD + directed traversal
  (`getDirectDependencies`, `getDependents`, `getUpstream`, `getDownstream`,
  `getPaths`, `getGraph`) + per-project graph validation.
- `ImpactAnalysisService` — BFS over incoming edges to compute the affected
  artifact set + classification (DIRECT / INDIRECT / POTENTIAL / NO_IMPACT).
  Pure BFS in application code; **never invokes an AI skill**.

### Context Engine integration

`ContextRequest` now optionally carries `includeDirectDependencies` /
`includeDependents`, `dependencyMaxDepth`, `dependencyStrict`,
`requiredRelationships` (filter). The engine receives a pluggable
`DependencyResolver` (default no-op) and merges dependency neighbors into
the `dependencies` layer with a budget cap (20% of the request budget).

### Graph validation

`ArtifactDependencyService.validateProjectGraph(projectId)` reports:
- `MISSING_ENDPOINT` — edge points at a non-existent artifact
- `SELF_DEPENDENCY` — source == target
- `CYCLE` — Kahn-layering detects a cycle in the project graph
- `DUPLICATE_DEPENDENCY` — same key twice (unique constraint also catches it)
- `STALE_CONFLICT` — `CONFLICTS_WITH` with confidence < 0.5
- `INVALID_DEPENDENCY_TYPES` — values not in the typed taxonomy

Invalid edges are rejected at write-time (`BadRequestException`); stale
edges surface as warnings on the read path.

### Impact levels

| Level    | Trigger                                            |
|----------|----------------------------------------------------|
| DIRECT   | single-hop dependent, hard/structural dependency   |
| INDIRECT | multi-hop dependent via DERIVES / IMPLEMENTS / SATISFIES |
| POTENTIAL | multi-hop dependent via CONFLICTS_WITH / RELATED_TO |
| NO_IMPACT | nothing depends on the artifact                  |

### REST endpoints (`/api/foundation/...`)

`POST /projects/:projectId/dependencies` · `PATCH /dependencies/:id` ·
`DELETE /dependencies/:id` · `GET /dependencies/types` ·
`GET /artifacts/:artifactId/dependencies` · `GET .../dependents` ·
`GET .../downstream` · `GET .../upstream` · `GET .../paths` ·
`GET .../impact` · `GET /projects/:projectId/graph` ·
`GET /projects/:projectId/graph/validation`.

### Tests (Phase 4)

- `artifact-dependency.service.spec.ts` — CRUD, self/duplicate/cycle/missing
  rejection, traversal (direct, dependents, downstream, upstream, paths),
  graph validation (cycle, stale conflict, type filtering), IMPACT_LEVELS export.
  TODOs added for batched writes + weight clamping.
- `impact-analysis.service.spec.ts` — direct/indirect cascade,
  POTENTIAL for soft edges at depth > 1, NO_IMPACT fallback, missing artifact
  warning, invalid dependency types surface as warnings.
  TODOs added for conflict-driven paths and weighted ranking.
- `context-dependency.spec.ts` — dependency-aware context adds relationships
  with paths; respects the 20%-of-budget dependency cap; resolver is a no-op
  when the request does not ask for dependencies.
  TODOs added for bidirectional retrieval and cache-key invalidation.

### Compatibility impact

- Existing `ArtifactRegistryService.addDependency` keeps working unchanged —
  the new `ArtifactDependencyService.create` is the strongly typed,
  validated path. Both write to the same table.
- Phase 1 entity gained three nullable columns (`confidence`,
  `source_reference`, `created_by`); existing rows remain valid via
  `synchronize: true`.
- No changes to the 21-agent pipeline, the workflow, or the legacy tables.
- No graph database introduced.


---

## Phase 5 — Specialized AI Skill Architecture

Replaces the concept of monolithic AI agents with reusable, structured AI
skills. **Production agents are NOT migrated yet** — the legacy
`AgentService` / `AgentRunnerService` pipeline is untouched. The skill layer
is additive and consumes the Phase 2–4 foundation (canonical model, context
engine, dependency graph, model router, usage tracking).

### Skill contract

A skill declares: what it does, required context, input/output schemas,
produced artifacts (canonical kinds), model tier, token budget, tools,
validation rules, quality gates, and skill-to-skill dependencies.

```ts
interface SkillDefinition {
  key; name; description; version; status;
  modelTier;            // 'high' | 'standard' | 'fast'
  promptKey;            // PromptBuilder template key
  maxTokens;            // output ceiling
  tokenBudget;          // context package budget
  inputSchema;          // JSON Schema
  outputSchema;         // JSON Schema
  producedArtifacts;    // CanonicalKind[]
  requiredContext;      // context domains
  validationRules;      // SkillValidationRule[]
  qualityGates;         // gate keys
  dependencies;         // SkillDependency[] (execution ordering)
  tool?;                // forced structured-output tool
}
```

### 15 standardized skills

`discovery` · `research` · `business-analysis` · `product-analysis` ·
`requirements-engineering` · `ux-design` · `data-architecture` ·
`ai-architecture` · `solution-architecture` · `security-review` ·
`qa-planning` · `estimation` · `validation` · `debate` · `gap-analysis`.

Document-generation skills are explicitly out of scope for Phase 5.

### Skill registry

`SkillRegistryService` persists the definitions into the **existing**
`agent_skills` table (extended with `prompt_key`, `required_context`,
`produced_artifacts`, `token_budget`, `quality_gates`, `dependencies`,
`status`). Supports: `seedAll`, `register`, `get`, `getDefinition`, `list`,
`enable`, `disable`, `version`, `resolve`.

### Skill input / output

```ts
interface SkillInput { projectId; workflowExecutionId?; skillId?; task; contextPackage?; artifactIds?; configuration? }
interface SkillOutput { artifacts; questions; assumptions; decisions; validationIssues; confidence; metadata }
```

All `output.artifacts` are canonical-kind payloads and are persisted through
`CanonicalModelService.ingest` — the full validation pipeline
(schema → normalization → business → provenance) runs before anything
becomes trusted canonical data.

### Context

Skills request context via `ContextRequest` built by
`defaultContextRequest(def)` — the Context Engine decides what is actually
included based on task type, domains, dependencies and the token budget.
Skills never load all project knowledge.

### Execution

`SkillExecutorService.execute(skillKey, input)`:
1. opens an `AgentSkillExecution` row
2. compiles a task-scoped context package
3. routes the model via `ModelRouterService`
4. builds messages through `PromptBuilderService` (versioned, never inline)
5. calls `LlmService.generateForcedStructured`
6. parses output, persists artifacts via canonical ingestion
7. records `ModelUsage` (tokens, cost) and completes the execution row

### API (`/api/foundation/skills/...`)

`GET /` · `GET /definitions` · `POST /seed` · `GET /:key` ·
`GET /:key/version` · `POST /:key/enable` · `POST /:key/disable` ·
`POST /:key/execute` (dry-run supported).

### Tests

Deferred per the migration plan — `skill.spec.ts` carries TODO markers for
registration, lookup, versioning, enable/disable, input/output validation,
context requirements, execution, token/cost tracking, failure/retry handling
and prompt resolution.


---

## Phase 5 Migration — 15 Agent Prompts + Skill Executor Wiring

Three of the four Phase-5 migration items are now implemented (tests deferred).

### 1. Prompt templates registered for all 15 skill keys

New files under `src/prompts/templates/structured/` (14 added, discovery existed):

`research` · `business-analysis` · `product-analysis` ·
`requirements-engineering` · `ux-design` · `data-architecture` ·
`ai-architecture` · `solution-architecture` · `security-review` ·
`qa-planning` · `estimation` · `validation` · `debate` · `gap-analysis`

All registered in `src/prompts/template-registry.ts` (16 templates total).
Every agent system prompt is composed as
`['@block:shared.output-contract', OUTLINE]` — identical text to the old
inline `SYSTEM` const. User messages are reproduced by template render
functions using the same `buildUserPrompt` / `formatKnowledge` /
`compactKnowledgeSummary` helpers, so rendered output is byte-identical to
the pre-migration prompts (verified for `research` and
`requirements-engineering`; `debate` keeps a system-only template with the
runtime user message appended by the service).

### 2. Production agents invoke SkillExecutorService behind the same API

All 15 agent services (`DiscoveryService` … `CriticService`, `DebateService`,
`GapAnalysisService`) keep their public `run(ctx): Promise<AgentResult>`
signature and post-processing. The `AgentRunnerService` call path is
**preserved** — validation, retries, padding and low-confidence logging are
unchanged. After each `agentRunner.run(...)`, the services now call (best-effort,
never pipeline-breaking):

```ts
await this.skillExecutor?.recordExecution({ skillKey, projectId, model, inputTokens, outputTokens });
await this.skillExecutor?.postPersist({ projectId, skillKey });
```

`recordExecution` writes an `AgentSkillExecution` row + a `ModelUsage` row
(tokens + cost). `postPersist` runs the skill's declared quality gates
(`QualityGateService`) and project dependency-graph validation
(`ArtifactDependencyService.validateProjectGraph`).

The agent prompt construction moved from inline `SYSTEM` consts to
`buildAgentMessages('<key>', ctx)` — no inline prompts remain for these agents.

### 3. Quality gates + dependency validation in the executor

`SkillExecutorService.postPersist(...)` runs both against the persisted
project state and returns `{ quality, dependencies }` (never throws).

### Wiring

- `SkillModule` now imports `QualityGateModule` + `ArtifactsModule`
- `AgentsModule` imports `SkillModule` (acyclic: SkillModule does not import
  AgentsModule)
- `@Optional() SkillExecutorService` injected into every migrated agent so the
  legacy pipeline still runs if the foundation module is ever absent

### Compatibility

- No change to the 21-agent pipeline behavior, `AgentRunnerService`,
  `knowledge_items`, workflow, frontend APIs, or the orval client
- Prompt output parity verified; targeted specs still pass
  (`prompt-builder`, `agent-runner`, `context-digest`)
- Remaining work: deferred skill tests (see `skill.spec.ts` TODOs) and
  migrating the 6 document-generation skills


---

## Phase 5 Migration (cont.) — 6 Document-Generation Skills

The document generators (`frd`, `user-stories`, `tech-arch`, `db-design`,
`api-spec`, `sow`) now use the PromptBuilder registry + SkillExecutorService,
closing out the remaining migration item.

### Templates (5 new, `document:*`)

- `document:user-stories` — `USER_STORIES_DOCUMENT_PROMPT`
- `document:tech-arch` — `HLD_DOCUMENT_PROMPT`
- `document:db-design` — `DB_DESIGN_DOCUMENT_PROMPT`
- `document:api-spec` — `API_SPEC_DOCUMENT_PROMPT`
- `document:sow-chunk` / `document:sow-merge` — SOW chunk + merge passes

All compose `['@block:enterprise.global', <DOC_PROMPT>]` (identical text to the
old inline system prompts) and reproduce the exact runtime user messages.
`document:frd` already existed. Template registry now holds 21 templates.

### Document services migrated

Each service keeps `run(ctx): Promise<AgentResult>` and the
`DocumentRunnerService` drift-check path; message building switched to
`buildDocumentMessages(docType, ctx)` (chunk/merge inputs for SOW). After
generation each service calls (best-effort):

```ts
await this.skillExecutor?.recordExecution({ skillKey, projectId, model, inputTokens, outputTokens });
await this.skillExecutor?.postPersist({ projectId, skillKey });
```

### Token tracking for documents

`DocumentRunnerService.generateDocument` now also returns
`tokens: { inputTokens, outputTokens, model }` (aggregated across retry
attempts) — additive, existing callers unaffected. Document skills now feed
real token/cost data into `ModelUsage`.

### Verification

- Rendered parity verified for `user-stories` and `sow-chunk` (system +
  user messages byte-identical to the pre-migration construction)
- `tsc --noEmit`, `nest build` (274 files), `check:schema` all PASS
- No changes to `AgentRunnerService`, `knowledge_items`, workflow, frontend
  APIs, or orval client


---

## Phase 6 — Legacy Agent Adapter + Shadow Migration

Adds a migration layer on top of the Phase 5 skill architecture. Production
legacy behavior is untouched (all modes default to `legacy`); migration is
feature-flag driven per agent.

### Architecture

```
Legacy Agent
  → LegacyAgentAdapterService
      → (shadow) SkillExecutorService.executeShadow — ZERO state change
      → comparison engine (metrics + migration rule)
      → (new) mapped Skill output → legacy-compatible AgentResult
```

### Feature flags (`migration.config.ts`)

- Modes: `legacy` | `shadow` | `new` — never hardcoded
- Resolution: `MIGRATION_MODE` global env → `MIGRATION_MODE_<AGENT>` per-agent
  env → default `legacy`
- Thresholds: `MIGRATION_MIN_QUALITY_SCORE`, `MIGRATION_MAX_COST_USD`,
  `MIGRATION_MAX_LATENCY_MS`, `MIGRATION_MIN_ARTIFACT_COUNT`,
  `MIGRATION_MIN_COVERAGE`, `MIGRATION_BLOCK_ON_CRITICAL`

### Migration batches

1. discovery, research, business-analysis, product-analysis
2. requirements-engineering, ux-design, data-architecture, ai-architecture
3. solution-architecture, security-review, qa-planning, estimation
4. validation, debate, gap-analysis

### Shadow execution

`SkillExecutorService.executeShadow` runs the full skill path (context engine →
prompt → LLM → parse → canonical validation) with **no production writes**:
no `AgentSkillExecution`, no `ModelUsage`, and canonical ingestion runs in
`dryRun` mode (`CanonicalModelService.ingest(..., { dryRun: true })`).
Legacy output remains authoritative in `shadow` mode.

### Comparison engine (`comparison.ts`)

Metrics: completeness, coverage, missing information, contradictions,
confidence delta, artifact-count delta, quality-score delta, token delta,
latency delta, cost delta, validation-failures delta.

Migration rule (a skill may replace a legacy agent only if ALL hold):
`schemaPasses AND qualityPasses AND noCriticalRegression AND requiredArtifacts
AND costLatencyAcceptable`. Results persist to `agent_comparisons`.

### Adapter (`legacy-agent.adapter.ts`)

- `legacy` → run legacy agent only
- `shadow` → legacy output authoritative + skill dry-run + comparison stored
- `new` → use skill output ONLY when the migration rule passes; otherwise
  fall back to the legacy implementation (skill failure ⇒ legacy fallback)

Batch 1 agents are wired through the adapter
(`discovery`, `research`, `business-analysis`, `product-analysis`) — their
public `run(ctx): Promise<AgentResult>` contract is preserved via a
`runLegacy` private delegate. Batches 2–4 stay on the plain legacy path.

### API

`GET /api/foundation/migration/status` ·
`GET /api/foundation/migration/comparisons` ·
`GET /api/foundation/migration/comparisons/:projectId/:agentKey`

### New table

`agent_comparisons` — id, projectId, workflowExecutionId?, agentKey, batch,
mode, legacy/skill/metrics/verdict (jsonb), createdAt.

### Tests

Deferred per migration plan — `migration.spec.ts` carries TODOs for adapter
translation, legacy compatibility, shadow execution, comparison, feature
flags, output parity, failure fallback, new-skill failure and legacy fallback.


---

## Phase 7 — Orchestration Engine 2.0

Dynamic, dependency-aware orchestration over Skills / Artifacts / Dependencies
/ Context / Quality Gates. The legacy DAG engine and the existing sequential
pipeline are NOT replaced — the new engine plans and executes the skill layer.

### Architecture

```
Project → Required Artifacts → Artifact Dependencies → Required Skills
  → Execution DAG (levels) → Skill Execution → Quality Gates
  → Artifact Persistence (canonical)
```

### Dynamic planner (`orchestration.plan.ts`, pure)

`planOrchestration(request, projectState, skillDefinitions)`:
- outcome → target artifact types (`full-requirements`, `requirements`,
  `architecture`, `database`, `security`, `qa`, or explicit types)
- missing artifacts → required skills (transitively via skill dependencies)
- topological levels (Kahn) — independent skills land in the same level
- conditional rules: `always` · `skip-if-no-signal` · `reuse-if-artifact-exists`
  · `skip-if-artifact-missing`
- reuse detection: an artifact already present (valid) marks the producing
  node `reuse` — the executor skips the LLM call
- human checkpoints: `{ afterSkill, type: REVIEW|APPROVAL|DECISION }`

`planAffectedOnly(...)` builds an incremental plan from an
ImpactAnalysisService closure (affected artifact types only).

### Executor (`orchestration.executor.ts`)

- States: `PLANNED QUEUED RUNNING WAITING COMPLETED FAILED BLOCKED CANCELLED
  RETRYING` (persisted in `orchestration_nodes`)
- Level-based parallel execution (bounded concurrency, default 4)
- Retry with exponential backoff + failure classification
  (transient: rate-limit/timeout → retry; permanent → FAILED)
- Dependency blocking: a failed required node blocks its dependents
- Human checkpoints pause the workflow → `WAITING` until approval
- Partial execution: `retryNode` re-runs a single node
- Resume: continues from the first incomplete level

### Service (`orchestration.service.ts`)

Wires the real skill runner (`SkillExecutorService.execute`) + quality gates
(`QualityGateService`) and impact analysis for incremental planning.

### API

`POST /plans` · `POST /plans/:id/run` · `POST /plans/:id/pause` ·
`POST /plans/:id/resume` · `POST /plans/:id/nodes/:nodeId/retry` ·
`POST /plans/:id/checkpoints/:nodeId/approve|reject` ·
`GET /plans/:id` · `GET /projects/:projectId/plans`

### New tables

- `orchestration_plans` — persisted plan + workflow status/level
- `orchestration_nodes` — per-node state (unique `(planId, nodeId)`)

### Tests

Deferred per migration plan — `orchestration.spec.ts` carries TODOs for DAG
generation, dependency ordering, parallel execution, conditional execution,
retry, failure recovery, checkpoint, resume, partial execution,
affected-only execution, human approval pause/resume, and reuse.


---

## Phase 8 — Centralized Quality Gate Engine

Expands the Phase 1 `QualityGateService` into a centralized validation and
quality decision system. AI artifacts are never treated as trusted project
data without passing the full pipeline. Opt-in — legacy agents are not forced
through it.

### Validation pipeline

```
LLM Output → Schema Validation → Normalization → Business Validation
  → Provenance Validation → Consistency Validation → Dependency Validation
  → Quality Evaluation → Quality Gate
  → PASS | WARNING | REVIEW_REQUIRED | BLOCKED → Persistence (quality_checks)
```

### Quality checks (11)

`schema` · `completeness` · `consistency` · `traceability` ·
`dependency_integrity` · `confidence` · `testability` ·
`requirement_quality` · `source_support` · `hallucination_risk` ·
`coverage` (project-level only)

### QualityResult

`status, score, checks, issues, warnings, blocking_issues, recommendations,
evaluated_at, evaluator_version (8.0.0)`.

### Artifact-specific thresholds (configurable, not hardcoded)

Defaults: requirement 85 · architecture_decision 80 · security_requirement 90
· api 85 · entity/relationship 85 · test_case 80 · user_story 85 · assumption
70 · legacy equivalents map too. Override via
`QUALITY_THRESHOLD_<KIND_UPPER_SNAKE>`; check weights via
`QUALITY_CHECK_WEIGHT_<KEY_UPPER>`.

### Conflict detection

- Lexical scan (`quality.conflicts.ts`): competing positions on a topic
  (e.g. requirement says OAuth, architecture says password-only → BLOCKED)
- Explicit `CONFLICTS_WITH` dependency edges surfaced as findings

### Files

- `quality.types.ts`, `quality.thresholds.ts`, `quality.conflicts.ts`,
  `quality.checks.ts`, `quality.evaluate.ts` (all pure)
- `quality-engine.service.ts` — persistence + project evaluation
- `quality.spec.ts` — TODO stub (tests deferred per migration plan)

### API (extended `/api/foundation/quality/engine/...`)

`GET /engine/checks` · `GET /engine/thresholds` ·
`POST /engine/projects/:projectId/evaluate` · `POST /engine/artifacts` ·
`GET /engine/projects/:projectId/checks`


---

## Phase 9 — Artifact Compiler

Converts the Canonical Project Model into project documents.
**STRUCTURED PROJECT DATA → COMPILER → DOCUMENT** — the project is never
regenerated from scratch with an LLM; canonical facts come only from the model.

### Document types (8)

`FRD` · `USER_STORIES` · `TECHNICAL_ARCHITECTURE` · `DATABASE_DESIGN` ·
`API_SPECIFICATION` · `QA_DOCUMENT` · `SOW` · `BUILD_PROMPT`
(mapped to existing persisted `document_type` values; `QA_DOCUMENT` is new).

### Compiler (pure)

`compileDocument(request)`:
- retrieves canonical artifacts (Nest layer) → validates completeness against
  `REQUIRED_KINDS` per doc type → resolves dependency edges → selects sections
  per document type → renders deterministic markdown → preserves provenance
  (epistemic class + source table) → preserves versions (metadata block with
  `source artifact versions`, `compiler_version`, `template_version`,
  `generated_at`) → emits compilation warnings (missing kinds, missing
  provenance, low confidence, dangling deps, empty sections).
- Deterministic: stable ordering + injectable `generatedAt` (same inputs →
  identical markdown).

### Document generator (reusable)

`DocumentGeneratorService` — compile → optional LLM **wording-only** refinement
(prompt forbids adding/changing facts; output verified ≥ 50 % input length) →
persist via `RkbService.saveDocument` (existing `documents` + per-document
versioning; `createVersion` option). No duplicate rendering logic: all
markdown primitives live in `compiler.markdown.ts`, section plans in
`compiler.sections.ts`.

### API

`GET /api/foundation/compiler/types` ·
`POST /api/foundation/compiler/projects/:projectId/compile` (persists) ·
`POST /api/foundation/compiler/projects/:projectId/dry-run` (no persistence)

### Compatibility

Existing legacy document generators are untouched and keep working; the
compiler runs alongside them. Knowledge fallback (`source=knowledge`) lets
pre-canonical projects compile from `knowledge_items`.


---

## Pipeline Application — Backend + Frontend Sync

The foundation architecture (Phases 1–9) is now applied to the running
pipeline and exposed in the frontend.

### Backend pipeline integration

- `DagAgentExecutorAdapter` runs the **Phase 8 Quality Engine** over the
  project whenever a compilation node completes (via `PipelineFoundationService`).
  Best-effort and additive — it only writes `quality_checks` rows; gated by
  `FOUNDATION_AUTO_QUALITY` (default true, set to `false` to disable).
- `DagEngineModule` imports `QualityGateModule` and `FoundationModule` for the engine.
- Everything else stays additive/opt-in: legacy agents, `AgentRunnerService`,
  `RkbService`, `knowledge_items`, documents and WebSocket events are
  untouched. Legacy document generators are NOT replaced — the Phase 9
  compiler is available via its own endpoints and the new UI.

### Frontend

- New workspace tab **Foundation** (`projects/:id?tab=foundation`) with six
  sub-tabs:
  - **Migration** — per-agent skill mode (legacy/shadow/new) + batch + shadow comparison results
  - **Canonical** — canonical project model items grouped by kind, with version/confidence/status/provenance chips
  - **Context** — compile a task-specific context package (task type picker, token estimate, warnings, artifact relevance)
  - **Quality** — run the centralized quality gate engine over the project; per-artifact status (PASS/WARNING/REVIEW_REQUIRED/BLOCKED), blocking issues, recommendations
  - **Compiler** — preview + persist compiled documents (FRD, User Stories, Architecture, DB, API, QA, SOW, Build Prompt) with warnings
  - **Orchestration** — create/run dynamic plans per outcome; view levels, states, skipped nodes, checkpoints
- New API client: `apps/client/src/lib/foundation-api.ts` (typed helpers for
  all foundation endpoints).
- Routing/tab wiring in `apps/client/src/pages/projects/[id].tsx`.

### Validation

- Frontend `tsc --noEmit` PASS; `vite build` PASS (only the pre-existing
  chunk-size advisory)
- Backend `tsc --noEmit` PASS; `nest build` PASS (308 files); `check:schema` PASS
- eslint: 0 errors (5 pre-existing warnings in `[id].tsx` untouched)


---

## Pipeline Auto-Integration (Foundation runs during every workflow)

The foundation architecture now runs **automatically** inside the existing
pipeline — no manual steps required.

### Backend flow (per stage + at completion)

```
legacy agent run
  → Context Engine enriches agent context with canonical items
  → agent output
  → canonical dual-write (validated — invalid output is never trusted)
  → per-stage Quality Engine evaluation
  → (completion) full Quality Engine run
  → (completion) Artifact Compiler auto-generates all 8 documents
```

Wired in `DagAgentExecutorAdapter` via `PipelineFoundationService`
(`apps/server/src/foundation/integration/`):

- `enrichKnowledgeWithCanonical(projectId, knowledgeItems)` — every agent's
  context now also includes canonical model items (dedup by externalId).
- `persistCanonicalFromAgent(projectId, agentKey, knowledgeItems)` —
  `legacy-canonical.mapper.ts` maps legacy knowledge types → canonical kinds
  (requirement, user_story, project_goal, assumption, constraint, risk,
  business_rule, acceptance_criterion, screen, test_case); each candidate is
  **dry-run validated** by the canonical pipeline before persistence.
- `evaluateCanonicalArtifacts(projectId)` — per-stage quality evaluation.
- `generateCompiledDocuments(projectId)` — at completion, the Phase 9
  compiler generates FRD / User Stories / Architecture / DB / API / QA / SOW /
  Build Prompt from canonical data (only when canonical artifacts exist).

All calls are best-effort — a foundation failure never breaks the legacy
pipeline stage.

### Feature flags (env)

| Flag | Default | Effect |
|---|---|---|
| `FOUNDATION_CANONICAL_WRITE` | `true` | canonical dual-write from agent output |
| `FOUNDATION_QUALITY_PER_STAGE` | `true` | per-stage quality evaluation |
| `FOUNDATION_COMPILER_AUTO` | `true` | auto-compile documents at completion |
| `FOUNDATION_AUTO_QUALITY` | `true` | full project quality run at completion |
| `MIGRATION_MODE_<AGENT>` | `legacy` | skill migration mode per agent |

### Frontend pipeline sync

- The workflow tab now shows a **Foundation Pipeline** card (Context → Skill →
  Canonical → Quality → Compiler) with the live canonical item count.
- Every agent card in the pipeline timeline shows a **`canonical: n`** badge
  when that agent wrote canonical items (counted from
  `provenance.producedBy`).
- The **Foundation** workspace tab (Migration / Canonical / Context / Quality /
  Compiler / Orchestration) remains available for deep inspection.


---

## Wiring Fix — Canonical Dual-Write Was Silently Skipping Everything

**Root cause:** the legacy→canonical mapper emitted provenance `sources` with
legacy `sourceCategory` values (`ai_analysis`, `prompt`, `document`), but the
Phase 2 canonical `sourceRefSchema` only accepts the canonical taxonomy
(`uploaded_document | user_input | research | interview | artifact |
user_decision | ai_inference | ai_assumption`). Every candidate failed the
dry-run gate → zero canonical writes → the pipeline appeared unchanged.

**Fix (`legacy-canonical.mapper.ts`):** legacy categories now map onto the
canonical taxonomy (`prompt→user_input`, `document→uploaded_document`,
`research→research`, `ai_analysis→ai_inference`, `debate→artifact`), and
`epistemicClass` derives from the mapped category (FACT for
user_input/uploaded_document/research, else INFERENCE).

**Verified:** `FUNCTIONAL_REQUIREMENT→requirement`,
`NON_FUNCTIONAL_REQUIREMENT→non_functional_requirement`,
`USER_STORY→user_story`, `BUSINESS_GOAL→project_goal`, `ASSUMPTION→assumption`,
`RISK→risk` all pass canonical schema validation; unmappable types
(e.g. `COMPETITOR`) are skipped.

**Also fixed — skills are now genuinely executable:** `skill.definitions.ts`
embedded placeholder `$ref` output schemas; all 15 definitions now carry the
real agent JSON schemas from `agent-json-schemas.ts` (15/15 verified), so the
skill executor / orchestration / UI skill runs use a valid structured-output
contract.

**Bridge verified end-to-end (fake services):** dual-write persisted
`requirement:FR-001` + `user_story:US-001`; quality evaluation ran; the
compiler generated all 8 documents.

### What you should now see after a pipeline run

- Per-agent `canonical: n` badges on the pipeline timeline
- Foundation Pipeline card with a live canonical item count
- Quality checks history under the Foundation → Quality tab
- Compiled documents under Foundation → Compiler (and the Documents tab)


---

## Aero Route Pipeline View (frontend)

A second pipeline visualization, toggled from the workflow tab
(**Pipeline** ⇄ **Aero Route**), built without touching the existing view.

- `AeroPipelineView.tsx` — route-map style: agents are stations on a flight
  path from **User Input** to **Final Documents**.
- **Running agent**: glowing/pulsing station ring + a plane icon flying down
  the connector; the connector line animates with flowing dashes.
- **Completed agent**: green check; the connector to the next station
  **unlinks** (broken dashed line + ✕ marker).
- **Pending**: dim dashed connector; **failed**: red station.
- Reuses the exact status resolution from `WorkflowPipeline`
  (`resolveAgentStatuses`, `AGENTS`, `DAG_TO_PIPELINE`, `STATUS_ORDER` are now
  exported) so both views always agree on agent state.
- Canonical badges (`canonical: n`) render in both views.


---

## Interactive Network Graph Pipeline View (frontend)

Replaced the Aero Route experiment with a proper node-link graph using the
already-installed `@xyflow/react` (React Flow v12).

- **Nodes** — every agent is a draggable entity node (icon, label, stage,
  status chip, canonical badge); plus `User Input` and `Final Documents`
  terminal nodes.
- **Edges** — connected node links following the pipeline chain:
  - running: animated cyan dashed edge + pulsing node halo
  - completed: solid emerald edge
  - completed → pending: **unlinked** (broken dash + ✕ label)
  - pending: dim dashed edge
- **Interaction** — drag nodes, scroll/wheel zoom, drag-to-pan, MiniMap
  (status-colored), Controls, fit-view on load; clicking a node opens the
  existing agent modal.
- Toggle in the workflow tab: **Pipeline ⇄ Network Graph**. The original
  `WorkflowPipeline` view is untouched.


---

## Interactive Network Graph View — Full Spec (frontend)

Upgraded `NetworkPipelineView.tsx` (React Flow v12, already installed) to the
full interactive node-link spec:

- **Dark theme, grid-based** — `colorMode="dark"` panel, dot/line grid
  background, dark entity cards.
- **Draggable entity cards** — every agent is a draggable node; manual
  positions persist.
- **Curved, directional connections** — bezier edges with arrowhead markers;
  the pipeline chain reads top-down with a visible flow direction.
- **Pan / zoom / search / select / inspect**
  - pan + wheel zoom (built-in), MiniMap + Controls
  - search box: highlights matches, dims the rest, Enter centers the view
  - click a node → inspect panel (status, stage, connections, canonical
    count, "inspect agent details")
- **Animated data-flow indicators** — running segments animate flowing
  dashes; highlighted paths animate cyan.
- **Path highlight + dimming** — selecting a node highlights its connected
  edges and neighbors and dims unrelated entities (nodes + edges).
- **Force-directed + manual layout** — "Auto Layout" runs an in-house force
  simulation (repulsion + springs + centering, no new deps) and applies
  positions; drag any node to override.
