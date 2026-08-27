# ROADMAP.md — Feature Status Matrix

> Current state of all features. Status keys: `done` · `stub/partial` · `not started` · `blocked` · `cancelled` · `deferred`

## Legend

| Status         | Meaning                                |
| -------------- | -------------------------------------- |
| `done`         | Fully implemented and working          |
| `stub/partial` | UI exists but incomplete or no backend |
| `not started`  | Planned but no work done               |
| `blocked`      | Cannot proceed due to dependency       |
| `cancelled`    | Explicitly dropped                     |
| `deferred`     | Deferred to future                     |

## Infrastructure

| Feature                | Status        | Notes                            |
| ---------------------- | ------------- | -------------------------------- |
| Monorepo (pnpm + Nx)   | `done`        | Nx partially leveraged           |
| NestJS backend         | `done`        | `apps/server/`                  |
| React + Vite frontend  | `done`        | `apps/client/`                 |
| PostgreSQL via TypeORM | `done`        | Synchronize in dev               |
| WebSocket real-time    | `done`        | Socket.IO, project rooms         |
| Docker deployment      | `not started` |                                  |
| CI/CD pipeline         | `not started` |                                  |
| Database migrations    | `not started` | Using `synchronize: true` in dev |
| API codegen (orval)    | `done`        | `lib/api-client-react/`          |

## Frontend

| Feature                         | Status         | Notes                                                                   |
| ------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Dashboard (all projects)        | `done`         | Cards, stats, new project button                                        |
| Project creation form           | `done`         | Name + idea textarea                                                    |
| Project workspace tabs          | `done`         | 9 tabs: workflow (with DAG controls), executions, documents, validation, questions, relationships, requirements, versions, gap-analysis |
| Workflow pipeline visualization | `done`         | Agent cards with status + integrated DAG execution controls              |
| DAG execution (integrated)      | `done`         | DAG controls merged into workflow tab; separate DAG Run tab removed      |
| Real-time agent activity        | `done`         | WebSocket + polling fallback                                            |
| Document preview                | `done`         | Rendered markdown (GFM tables, mermaid diagrams) + Preview/Source toggle |
| Document download               | `done`         | MD + Word (.docx) export                                                |
| Agent details modal             | `done`         | Click any agent card to view outputs in expandable modal                |
| Workflow pause/resume           | `done`         | Pause button during pipeline, resume from paused state                  |
| Agent regenerate                | `done`         | Regenerate button on any completed agent, re-runs from that stage       |
| Multi-document viewer           | `done`         | Tabbed document viewer supporting all 7 generated document types        |
| Dynamic AI confidence           | `done`         | Confidence varies per item based on evidence/reasoning/content          |
| Document PDF export             | `stub/partial` | Button exists, no implementation                                        |
| Dark/light theme                | `done`         | Header toggle, CSS variables                                            |
| AI Workflow blueprint           | `done`         | 14-agent detail cards                                                   |
| Validation hub                  | `done`         | Cross-project issue browser                                             |
| Documents hub                   | `done`         | All documents with stats                                                |
| Analytics page                  | `done`         | Token usage, agent performance                                          |
| Settings page                   | `done`         | LLM config, pipeline defaults                                           |
| Project search                  | `done`         | Dialog with project list                                                |
| Breadcrumb navigation           | `done`         | Dashboard → Workspace                                                   |
| Version history                 | `done`        | Per-document versions with document-type filter + diff viewer           |
| PDF export                      | `not started`  | Button disabled                                                         |

## Backend

| Feature                               | Status        | Notes                                                                               |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| Project CRUD                          | `done`        |                                                                                     |
| 20-agent pipeline                     | `done`        | Sequential execution                                                                |
| LLM integration (Groq/OpenAI)         | `done`        | Configurable via env                                                                |
| WebSocket events                      | `done`        | Agent activity, knowledge, status                                                   |
| Dashboard service                     | `done`        | Aggregated snapshot                                                                 |
| Aggregate endpoints                   | `done`        | Cross-project data                                                                  |
| Settings persistence                  | `done`        | Pipeline defaults                                                                   |
| Health check                          | `done`        | `/api/healthz`                                                                      |
| Pause workflow                        | `done`        | `POST /:id/pause` — graceful pause after current stage                              |
| Regenerate from agent                 | `done`        | `POST /:id/regenerate/:agentKey` — re-run from specific stage                       |
| Agent-specific knowledge query        | `done`        | `GET /:id/knowledge/by-agent/:agentKey`                                             |
| Dynamic confidence scoring            | `done`        | Based on evidence, reasoning, description quality                                   |
| Multi-document generation             | `done`        | 5 new agents generate FRD, User Stories, Tech Arch, DB Design, API Spec             |
| Document type API                     | `done`        | `GET /:id/documents` and `GET /:id/documents/:type`                                 |
| Deterministic output validator (P0-3) | `done`        | Pure validator + per-agent contracts + unit tests                                   |
| Forced structured output (P0-1)       | `done`        | Per-agent JSON schemas + forced tool-use                                            |
| Retry-with-feedback loop (P0-2)       | `done`        | Validate → correct → re-validate, cap 2 retries                                     |
| Discovery checkpoint (P0-4)           | `done`        | Human-in-the-loop gate after Discovery                                              |
| Pipeline order + ID lock (P1-2)       | `done`        | Shared config + no-forward-reference assertion                                      |
| Context digest (P1-1)                 | `done`        | Per-agent immediate/distant upstream trimming                                       |
| Golden-dataset eval (P2-1)            | `done`        | 8 fixed inputs + `pnpm run eval:golden`                                             |
| Model tiering (P2-2)                  | `done`        | `LLM_MODEL_HIGH/STANDARD/FAST` per agent                                            |
| Run logging + patterns (P2-3)         | `done`        | `run_logs` + `GET /api/aggregate/run-log-patterns`                                  |
| Prompt/schema versioning (P2-4)       | `done`        | Versions stored on every run log                                                    |
| Document drift check                  | `done`        | Markdown doc IDs vs source JSON IDs, persisted as `drift` run-logs                  |
| Gap Analysis engine                  | `done`        | Single-pass analysis, review-gated per-gap proposals, targeted section-level patches |
| Document versioning (per-document)   | `done`        | Version 1 on initial generation; new version only per regenerated document          |
| Project Context Service              | `stub/partial`| Module + REST/SSE + commit/versioning/conflict rules done; agents not yet migrated to write through it |
| Gap Analysis pipeline stage           | `done`        | GAP_ANALYSIS stage after document generation; pauses for review, finalizes workflow |
| Authentication                        | `not started` | No auth model                                                                       |
| Rate limiting                         | `not started` |                                                                                     |
| API versioning                        | `not started` | No `/v1` prefix                                                                     |
| Migrations                            | `not started` |                                                                                     |

## AI Agents

| Agent                       | Status | Notes                                                                   |
| --------------------------- | ------ | ----------------------------------------------------------------------- |
| Discovery                   | `done` |                                                                         |
| Research                    | `done` |                                                                         |
| Business Analyst            | `done` |                                                                         |
| Product Manager             | `done` |                                                                         |
| Requirements Engineer       | `done` |                                                                         |
| UX                          | `done` |                                                                         |
| Data Architect              | `done` |                                                                         |
| AI Architect                | `done` |                                                                         |
| Solution Architect          | `done` |                                                                         |
| Security                    | `done` |                                                                         |
| QA                          | `done` |                                                                         |
| Estimation                  | `done` |                                                                         |
| Critic (Validation)         | `done` |                                                                         |
| Debate                      | `done` | Multi-agent debate on validation findings                               |
| Compiler                    | `done` | Assembles final doc, now also produces COMPILED_DOCUMENT knowledge item |
| FRD Generator               | `done` | Generates Functional Requirements Document                              |
| User Stories Generator      | `done` | Generates User Stories & Acceptance Criteria                            |
| Tech Architecture Generator | `done` | Generates Technical Architecture (HLD)                                  |
| Database Design Generator   | `done` | Generates Database Design & Schema                                      |
| API Spec Generator          | `done` | Generates OpenAPI/Swagger Specification                                 |
| SOW Generator                | `done` | Generates client-facing Scope of Work (feature-by-feature SOW)          |

## Backlog

See `BACKLOG.md` for prioritized items. RoadMAP points to BACKLOG for priority ordering.
