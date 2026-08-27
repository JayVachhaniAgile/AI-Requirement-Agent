# DATA_MODEL.md — Database Reference

> All entities, relationships, and example shapes.

## Entity Relationship Overview

```mermaid
erDiagram
    projects ||--o{ workflow_steps : ""
    projects ||--o{ knowledge_items : ""
    projects ||--o{ agent_executions : ""
    projects ||--o{ clarification_questions : ""
    projects ||--o{ validation_issues : ""
    projects ||--|| documents : ""
    projects }o--}o{ settings : ""
```

## Tables

### projects

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| name | varchar(500) | Required |
| idea | text | Required |
| status | varchar(50) | Default `CREATED` |
| current_stage | varchar(100) | Nullable, set during workflow |
| error_message | text | Nullable, set on failure |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Status values:** `CREATED`, `DISCOVERING`, `RESEARCHING`, `ANALYSING`, `GENERATING_REQUIREMENTS`, `DESIGNING`, `ARCHITECTING`, `SECURITY_REVIEW`, `QA_ANALYSIS`, `ESTIMATING`, `VALIDATING`, `COMPILING`, `COMPLETED`, `FAILED`, `CANCELLED`

### workflow_steps

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| stage | varchar(100) | e.g. `DISCOVERY`, `RESEARCH` |
| status | varchar(50) | Default `QUEUED` |
| started_at | timestamptz | Nullable |
| completed_at | timestamptz | Nullable |
| error | text | Nullable |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Status values:** `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`

### knowledge_items

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| external_id | varchar(100) | Nullable, agent-assigned |
| type | varchar(100) | e.g. `FUNCTIONAL_REQUIREMENT`, `ASSUMPTION` |
| domain | varchar(64) | Nullable, canonical Project Context domain (see `PROJECT_CONTEXT.md`) |
| title | varchar(500) | Required |
| description | text | Nullable |
| status | varchar(50) | Default `DRAFT` |
| source | varchar(100) | Nullable, agent key |
| created_by | varchar(100) | Nullable, agent key |
| metadata | text | Nullable, JSON string |
| version | int | Default 1 |
| related_ids | text[] | Array of related item IDs |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Type values:** `FUNCTIONAL_REQUIREMENT`, `ASSUMPTION`, `VALIDATION_SCORES`, `CRITIC_SCORE`, `AI_MEMORY`, etc.

### agent_executions

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| agent_key | varchar(100) | e.g. `discovery`, `research` |
| status | varchar(50) | Default `RUNNING` |
| model | varchar(100) | Nullable |
| input_tokens | int | Default 0 |
| output_tokens | int | Default 0 |
| retry_count | int | Default 0 |
| error | text | Nullable |
| started_at | timestamptz | Nullable |
| completed_at | timestamptz | Nullable |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

### clarification_questions

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| question | text | Required |
| context | text | Nullable |
| is_blocking | boolean | Default false |
| status | varchar(50) | Default `PENDING` |
| answer | text | Nullable |
| answered_at | timestamptz | Nullable |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

### validation_issues

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| external_id | varchar(100) | Nullable |
| severity | varchar(50) | e.g. `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| category | varchar(100) | Required |
| source_agent | varchar(100) | Nullable |
| affected_ids | text[] | Array of related IDs |
| problem | text | Required |
| evidence | text | Nullable |
| impact | text | Nullable |
| recommended_correction | text | Nullable |
| requires_human_decision | boolean | Default false |
| status | varchar(50) | Default `OPEN` |
| created_at | timestamptz | Auto |

### documents

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete, unique |
| status | varchar(50) | Default `DRAFT` |
| markdown_content | text | Nullable |
| validation_score | text | Nullable — NOTE: no longer set by `saveDocument()` to avoid overriding AI confidence with version number |
| document_type | varchar(50) | Default `COMPILED_DOCUMENT`; one current row per type (`FRD_DOCUMENT`, `USER_STORIES_DOCUMENT`, `TECH_ARCH_DOCUMENT`, `DB_DESIGN_DOCUMENT`, `API_SPEC_DOCUMENT`, `SOW_DOCUMENT`) |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

### document_versions

Version history is **per-document**: the version counter is scoped to
(project_id, document_type), so every document starts at Version 1 during
initial generation and a regeneration only bumps that document's version.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| project_id | UUID (FK) | Cascade delete |
| document_type | varchar(100) | Default `COMPILED_DOCUMENT` — the document this version belongs to |
| version | int | Per-(project_id, document_type) counter, starts at 1 |
| markdown_content | text | Snapshot of the full document at this version |
| change_summary | text | Nullable, human-readable change description |
| affected_item_ids | text[] | Knowledge items referenced by this version |
| trigger_event | varchar(100) | Nullable, e.g. `FRD_GENERATION`, `recompilation`, `gap-analysis` |
| created_at | timestamptz | Auto |

`deleteDocument(projectId, documentType?)` removes only current `documents`
rows (scoped to one type when provided) and **never deletes version snapshots**
— user-initiated regeneration creates a new version instead of losing history.
`deleteDocumentAndVersions(projectId)` is used only by pipeline-internal
restarts (re-running from DISCOVERY/COMPILATION) so a fresh initial generation
starts every document back at Version 1.

### settings

| Column | Type | Notes |
|---|---|---|
| key | varchar(100) (PK) | |
| value | text | Nullable |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Default keys:** `autoResumeOnFailure`, `parallelAgentExecution`, `generateDiagrams`, `exportPdfOnCompletion`, `minConfidenceScore`, `maxCriticalIssues`, `maxOpenQuestions`, `minRequirementCoverage`, `theme`

### discovery_checkpoints

Human-in-the-loop gate after the Discovery agent (P0-4). One row per project.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| project_id | UUID (FK) | Unique — one checkpoint per project |
| idea_interpretation | text | Required |
| problem_statement | text | Required |
| proposed_solution | text | Required |
| initial_scope | text | Nullable |
| blocking_questions_json | text | Nullable, JSON snapshot of discovery blocking questions |
| status | varchar(50) | Default `PENDING`; `CONFIRMED` after user confirms/edits |
| created_at / updated_at | timestamptz | Auto |

### run_logs

Per-run pipeline events for regression eval + pattern review (P2-1/P2-3).

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| project_id | UUID (FK) | Cascade delete |
| agent_key | varchar(100) | Agent that produced the event |
| kind | varchar(50) | `retry` \| `parse_failure` \| `validation_failure` \| `padding` \| `low_confidence` |
| message | text | Human-readable event detail |
| data_json | text | Nullable, structured payload (codes, reasons, attempt) |
| prompt_version | varchar(50) | Nullable — agent prompt revision (P2-4) |
| schema_version | varchar(50) | Nullable — content hash of schema + validation contract |
| created_at | timestamptz | Auto |

### gap_analysis_runs

One row per analysis pass. Each run is a **single analysis** (no auto
re-analysis loop); iterations increment across executions so history stays
ordered.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| project_id | UUID (FK) | Cascade delete |
| iteration | int | 1-based, increments across runs |
| coverage_pct / quality_score | int | Estimated coverage and quality from the analysis |
| total_gaps / resolved_gaps / remaining_gaps | int | total = all findings; remaining = actionable (UPDATE/APPEND); resolved = 0 (analysis never applies changes) |
| status | varchar(50) | Default `COMPLETED` |
| findings_json | text | Nullable, JSON snapshot of this run's findings |
| summary | text | Nullable |
| documents_updated_json | text | Nullable, JSON array of document types with pending proposals |
| created_at | timestamptz | Auto |

### gap_analysis_active_runs

Live state of the currently running/last run; survives page refreshes and
drives polling + Socket.IO progress.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| project_id | UUID (FK) | Unique — one active row per project |
| status | varchar(50) | `RUNNING` \| `AWAITING_REVIEW` \| `COMPLETED` \| `CANCELLED` \| `FAILED` |
| iteration | int | Latest analysis iteration |
| phase | varchar(100) | `starting` \| `analyzing` \| `proposing` \| `awaiting_review` \| `completed` \| `cancelled` \| `failed` |
| phase_detail | text | Nullable |
| error | text | Nullable |
| started_at / completed_at | timestamp | Nullable |
| created_at / updated_at | timestamptz | Auto |

### gap_analysis_proposals

Each proposal represents **one gap** (one finding) awaiting user review. Nothing
is merged into a document until the user applies the proposal; applying
generates a targeted patch for the affected section only (never a full-document
regeneration).

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| project_id | UUID (FK) | Cascade delete |
| iteration | int | Analysis run this proposal belongs to |
| document_type | varchar(100) | Affected document type |
| section | varchar(500) | Nullable, affected heading/section within the document |
| confidence | int | Nullable, 0-100 confidence score from analysis |
| existing_content | text | Nullable, document content at proposal time |
| proposed_content | text | Nullable — merged document content after the user applies the proposal |
| reasons_json | text | The single finding: `[{finding, explanation, severity, section, confidence, suggestion}]` |
| status | varchar(50) | `PENDING` \| `APPLIED` \| `REJECTED` \| `DISCARDED` |
| applied_at | timestamp | Nullable |
| created_at / updated_at | timestamptz | Auto |

### project_context_items

Canonical live context items for the Project Context Service (see `PROJECT_CONTEXT.md`). Keyed by `(project_id, domain, external_id)`.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Stable across versions |
| project_id | uuid | |
| domain | varchar(64) | One of 16 canonical domains |
| external_id | varchar(100) | Nullable — agent-assigned cross-ref (legacy rows use `LEGACY-<id>`) |
| type | varchar(100) | Sub-type within domain |
| title | text | |
| body | text | Nullable |
| producer_agent | varchar(100) | Nullable, agent key that last wrote it |
| status | varchar(32) | `DRAFT` \| `ACTIVE` \| `SUPERSEDED` \| `FLAGGED` |
| version | int | Monotonic per item id |
| related_ids | text[] | |
| metadata | text | Nullable JSON |
| created_at / updated_at | timestamptz | Auto |

### project_context_snapshots

Immutable history of context items, written before every mutation to an existing item.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| item_id | uuid | |
| project_id | uuid | |
| version | int | Captured version |
| snapshot_json | text | Full serialized item |
| change_summary | text | Nullable |
| commit_id | uuid | Nullable, links to the commit log |
| trigger_event | varchar(64) | Nullable |
| created_at | timestamptz | Auto |

### project_context_commits

Append-only audit trail of every context mutation.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Commit id |
| project_id | uuid | |
| actor_key | varchar(100) | Nullable |
| actor_type | varchar(32) | `agent` \| `user` \| `system` |
| change_type | varchar(32) | `CREATE` \| `UPDATE` \| `SUPERSEDE` \| `DELETE` \| `MIXED` \| `BACKFILL` \| `NOOP` |
| affected_item_ids | text[] | |
| reason | text | Nullable |
| metadata | text | Nullable JSON (prompt/schema versions, conflict outcome) |
| created_at | timestamptz | Auto |

### prompt_templates

Prompt Builder Framework (see `PROMPT_BUILDER.md`): persisted snapshot of author-time templates for audit/debug.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| prompt_key | varchar(100) | Unique — template key (`agent:discovery`, `document:frd`) |
| kind | varchar(32) | `agent` \| `document` |
| content | text | Serialized PromptTemplate JSON |
| content_hash | varchar(32) | Auto content hash |
| variables_json | text | Nullable, declared variable contract |
| metadata | text | Nullable |
| created_at / updated_at | timestamptz | Auto |

### prompt_versions

Immutable prompt version records (P2-4 traceability).

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| prompt_key | varchar(100) | |
| version | varchar(64) | e.g. `v1.1-<hash8>` |
| content_hash | varchar(32) | |
| schema_version | varchar(32) | Nullable, for structured agents |
| diff | text | Nullable |
| created_by | varchar(100) | Nullable |
| created_at | timestamptz | Auto |

### prompt_test_runs

Snapshot-test results for prompt templates.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| prompt_key | varchar(100) | |
| version | varchar(64) | |
| sample_key | varchar(100) | Nullable |
| result | varchar(32) | `pass` \| `fail` \| `snapshot` |
| assertions_json | text | Nullable |
| created_at | timestamptz | Auto |

### workflow_dag_definitions

DAG workflow engine (see `DAG_WORKFLOW.md`): persisted DAG definitions (audit copy).

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| key | varchar(100) | Unique, e.g. `crystallize-pipeline` |
| name | varchar(200) | |
| definition_json | text | Serialized `WorkflowDagDefinition` |
| created_at / updated_at | timestamptz | Auto |

### workflow_dag_runs

One execution of a DAG definition for a project.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid | Indexed |
| definition_key | varchar(100) | |
| status | varchar(32) | `PENDING` \| `RUNNING` \| `PAUSED` \| `WAITING_APPROVAL` \| `COMPLETED` \| `FAILED` \| `CANCELLED` |
| current_level | int | Last executed level |
| current_node_key | varchar(100) | Checkpoint/failed node |
| error | text | Nullable |
| created_at / updated_at | timestamptz | Auto |

### workflow_dag_node_runs

Per-node execution state inside a DAG run.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| run_id | uuid | Indexed |
| node_key | varchar(100) | |
| status | varchar(32) | `PENDING` \| `RUNNING` \| `COMPLETED` \| `FAILED` \| `SKIPPED` \| `WAITING_APPROVAL` \| `BLOCKED` |
| depends_on | text[] | Direct dependencies |
| required | boolean | Optional nodes skippable |
| checkpoint | boolean | Human approval gate |
| retry_count / max_retries | int | |
| timeout_ms | int | Nullable |
| started_at / completed_at | timestamptz | Nullable |
| error | text | Nullable |
| output_json | text | Nullable |
| created_at / updated_at | timestamptz | Auto |

### knowledge_edges

Structured Knowledge Base (see `KNOWLEDGE_BASE.md`): typed, directed edges between `project_context_items`.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| project_id | uuid | Indexed |
| source_id | uuid | Indexed, FK → project_context_items |
| target_id | uuid | Indexed, FK → project_context_items |
| relation | varchar(64) | Edge taxonomy (`contains`, `satisfies`, `exposes`, …) |
| weight | real | Default 1 |
| producer_agent | varchar(100) | Nullable |
| commit_id | uuid | Nullable, context commit traceability |
| metadata | text | Nullable |
| created_at | timestamptz | Auto |

Unique: `(project_id, source_id, target_id, relation)`.

### knowledge_embeddings

Optional semantic embeddings for knowledge items (cosine retrieval; pgvector-ready).

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| item_id | uuid | Unique, FK → project_context_items |
| model | varchar(64) | Embedding model |
| embedding | text | JSON array of numbers |
| created_at / updated_at | timestamptz | |

### Relationship graph (domains + relations)

No new tables. The relationship graph is implemented on `project_context_items`
(24 domains — added `epics`, `apis`, `database_tables`, `ui_screens`,
`test_cases`) and `knowledge_edges` (24 relations — added `drives`, `defines`,
`implemented_by`, `maps_to`, `rendered_by`, `verified_by`, `covered_by`).
Visualization layers are derived (`knowledge-graph/relationship-layers.ts`).
See `RELATIONSHIP_GRAPH.md`.
