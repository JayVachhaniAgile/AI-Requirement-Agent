# ROADMAP.md — Feature Status Matrix

> Current state of all features. Status keys: `done` · `stub/partial` · `not started` · `blocked` · `cancelled` · `deferred`

## Legend

| Status | Meaning |
|---|---|
| `done` | Fully implemented and working |
| `stub/partial` | UI exists but incomplete or no backend |
| `not started` | Planned but no work done |
| `blocked` | Cannot proceed due to dependency |
| `cancelled` | Explicitly dropped |
| `deferred` | Deferred to future |

## Infrastructure

| Feature | Status | Notes |
|---|---|---|
| Monorepo (pnpm + Nx) | `done` | Nx partially leveraged |
| NestJS backend | `done` | `apps/backend/` |
| React + Vite frontend | `done` | `apps/frontend/` |
| PostgreSQL via TypeORM | `done` | Synchronize in dev |
| WebSocket real-time | `done` | Socket.IO, project rooms |
| Docker deployment | `not started` | |
| CI/CD pipeline | `not started` | |
| Database migrations | `not started` | Using `synchronize: true` in dev |
| API codegen (orval) | `done` | `lib/api-client-react/` |

## Frontend

| Feature | Status | Notes |
|---|---|---|
| Dashboard (all projects) | `done` | Cards, stats, new project button |
| Project creation form | `done` | Name + idea textarea |
| Project workspace tabs | `done` | 6 tabs: workflow, executions, docs, validation, questions, requirements |
| Workflow pipeline visualization | `done` | Agent cards with status |
| Real-time agent activity | `done` | WebSocket + polling fallback |
| Document preview | `done` | Markdown rendering |
| Document download | `done` | MD export |
| Agent details modal | `done` | Click any agent card to view outputs in expandable modal |
| Workflow pause/resume | `done` | Pause button during pipeline, resume from paused state |
| Agent regenerate | `done` | Regenerate button on any completed agent, re-runs from that stage |
| Dynamic AI confidence | `done` | Confidence varies per item based on evidence/reasoning/content |
| Document PDF export | `stub/partial` | Button exists, no implementation |
| Dark/light theme | `done` | Header toggle, CSS variables |
| AI Workflow blueprint | `done` | 14-agent detail cards |
| Validation hub | `done` | Cross-project issue browser |
| Documents hub | `done` | All documents with stats |
| Analytics page | `done` | Token usage, agent performance |
| Settings page | `done` | LLM config, pipeline defaults |
| Project search | `done` | Dialog with project list |
| Breadcrumb navigation | `done` | Dashboard → Workspace |
| Version history | `stub/partial` | Tab exists, no data |
| PDF export | `not started` | Button disabled |

## Backend

| Feature | Status | Notes |
|---|---|---|
| Project CRUD | `done` | |
| 15-agent pipeline | `done` | Sequential execution |
| LLM integration (Groq/OpenAI) | `done` | Configurable via env |
| WebSocket events | `done` | Agent activity, knowledge, status |
| Dashboard service | `done` | Aggregated snapshot |
| Aggregate endpoints | `done` | Cross-project data |
| Settings persistence | `done` | Pipeline defaults |
| Health check | `done` | `/api/healthz` |
| Pause workflow | `done` | `POST /:id/pause` — graceful pause after current stage |
| Regenerate from agent | `done` | `POST /:id/regenerate/:agentKey` — re-run from specific stage |
| Agent-specific knowledge query | `done` | `GET /:id/knowledge/by-agent/:agentKey` |
| Dynamic confidence scoring | `done` | Based on evidence, reasoning, description quality |
| Authentication | `not started` | No auth model |
| Rate limiting | `not started` | |
| API versioning | `not started` | No `/v1` prefix |
| Migrations | `not started` | |

## AI Agents

| Agent | Status | Notes |
|---|---|---|
| Discovery | `done` | |
| Research | `done` | |
| Business Analyst | `done` | |
| Product Manager | `done` | |
| Requirements Engineer | `done` | |
| UX | `done` | |
| Data Architect | `done` | |
| AI Architect | `done` | |
| Solution Architect | `done` | |
| Security | `done` | |
| QA | `done` | |
| Estimation | `done` | |
| Critic (Validation) | `done` | |
| Debate | `done` | Multi-agent debate on validation findings |
| Compiler | `done` | Assembles final doc, now also produces COMPILED_DOCUMENT knowledge item |

## Backlog

See `BACKLOG.md` for prioritized items. RoadMAP points to BACKLOG for priority ordering.
