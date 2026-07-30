# DATA_MODEL.md — Database Reference

> All entities, relationships, and example shapes.

## Entity Relationship Overview

```
projects (1) ──────< (N) workflow_steps
projects (1) ──────< (N) knowledge_items
projects (1) ──────< (N) agent_executions
projects (1) ──────< (N) clarification_questions
projects (1) ──────< (N) validation_issues
projects (1) ──────── (1) documents
projects (N) ──────> (N) settings (key-value)
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
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

### settings

| Column | Type | Notes |
|---|---|---|
| key | varchar(100) (PK) | |
| value | text | Nullable |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

**Default keys:** `autoResumeOnFailure`, `parallelAgentExecution`, `generateDiagrams`, `exportPdfOnCompletion`, `minConfidenceScore`, `maxCriticalIssues`, `maxOpenQuestions`, `minRequirementCoverage`, `theme`
