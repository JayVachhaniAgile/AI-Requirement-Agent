# CONTEXT.md — Full Technical Context

> Detailed technical context for the AI Requirements Engineering Platform.

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                        │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │  Dashboard     │  │ Project       │  │  Hub Pages              │ │
│  │  (all projects)│  │ Workspace     │  │  (workflow, validation, │ │
│  │               │  │ (per-project) │  │   documents, analytics) │ │
│  └───────┬───────┘  └───────┬───────┘  └───────────┬─────────────┘ │
│          │                  │                      │                 │
│          └──────────────────┼──────────────────────┘                 │
│                             │                                        │
│                ┌────────────┴────────────┐                          │
│                │   API Client (React Query)│                          │
│                │   + WebSocket (socket.io)│                          │
│                └────────────┬────────────┘                          │
└─────────────────────────────┼───────────────────────────────────────┘
                              │  HTTP + WS
┌─────────────────────────────┼───────────────────────────────────────┐
│                      Backend (NestJS)                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  ProjectsController        SettingsController                  ││
│  │  AggregateController       HealthController                    ││
│  │  ProjectsGateway (WS)                                            ││
│  └──────────┬───────────────────────────────────┬─────────────────┘│
│             │                                   │                   │
│  ┌──────────┴──────────┐           ┌────────────┴───────────────┐  │
│  │  ProjectsService    │           │  WorkflowService            │  │
│  │  DashboardService   │           │  (14-agent pipeline)        │  │
│  │  SettingsService    │           │                             │  │
│  └──────────┬──────────┘           └────────────┬───────────────┘  │
│             │                                   │                   │
│             └───────────────┬───────────────────┘                   │
│                             │                                       │
│  ┌──────────────────────────┴─────────────────────────────────────┐ │
│  │               TypeORM (PostgreSQL)                             │ │
│  │  projects | knowledge_items | workflow_steps |                 │ │
│  │  agent_executions | clarification_questions |                  │ │
│  │  validation_issues | documents | settings                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Directory Structure

```
/
├── apps/
│   ├── backend/          # NestJS REST API + WebSocket gateway
│   │   └── src/
│   │       ├── agents/         # 14 agent services (discovery, research, etc.)
│   │       ├── aggregate/      # Cross-project aggregate endpoints
│   │       ├── database/       # TypeORM entities
│   │       ├── health/         # Health check endpoint
│   │       ├── llm/            # OpenAI / Groq LLM service
│   │       ├── projects/       # Project CRUD + workflow controller
│   │       ├── realtime/       # WebSocket gateway + event services
│   │       ├── rkb/            # Knowledge base service
│   │       ├── settings/       # Pipeline defaults persistence
│   │       └── workflow/       # Workflow orchestration service
│   └── frontend/         # React + Vite SPA
│       └── src/
│           ├── components/
│           │   ├── layouts/     # AppLayout (sidebar + header)
│           │   ├── projects/    # Project tab components
│           │   ├── ui/          # ShadCN/ui components
│           │   └── theme-*      # Theme provider + toggle
│           ├── hooks/           # Custom hooks (socket, toast, mobile)
│           ├── lib/             # API helpers, constants, types
│           └── pages/           # Route pages
└── lib/
    ├── api-client-react/  # Auto-generated React Query hooks
    └── db/                # Drizzle schema (reference only, not used by backend)
```

## 3. Frontend Routes

| Path | Component | Auth | Description |
|---|---|---|---|
| `/` | Redirect → `/dashboard` | None | Entry redirect |
| `/dashboard` | `DashboardPage` | None | All projects card grid, stats, new project button |
| `/projects/new` | `NewProjectPage` | None | Submit software idea form |
| `/projects/:id` | `ProjectWorkspace` | None | Per-project workspace with tabs (workflow, executions, docs, etc.) |
| `/ai-workflow` | `AiWorkflowPage` | None | Pipeline blueprint, agent descriptions |
| `/validation` | `ValidationHubPage` | None | Cross-project validation issues |
| `/documents` | `DocumentsHubPage` | None | All generated documents |
| `/analytics` | `AnalyticsPage` | None | Token usage, agent performance |
| `/settings` | `SettingsPage` | None | LLM providers, pipeline defaults |

### Project Workspace Tabs

| Tab | Component | Purpose |
|---|---|---|
| Workflow | `WorkflowPipeline` | Visual 14-agent pipeline |
| Execution Logs | `TabExecutions` | Per-agent execution history |
| Documents | `TabDocument` | Generated document preview |
| Validation | `TabValidation` | Validation issues |
| Questions | `TabQuestions` | Clarification Q&A |
| Requirements | `TabRequirements` | Functional requirements list |
| Versions | (placeholder) | Document version history |

## 4. Backend API Routes

All routes prefixed with `/api` (set in `main.ts`).

### Projects Controller (`/api/projects`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List all projects |
| POST | `/` | Create new project |
| GET | `/:id` | Get project by ID |
| DELETE | `/:id` | Delete project |
| POST | `/:id/start` | Start/resume workflow |
| POST | `/:id/recompile` | Recompile document |
| POST | `/:id/cancel` | Cancel running workflow |
| POST | `/:id/pause` | Pause running workflow (graceful, stage completes first) |
| POST | `/:id/regenerate/:agentKey` | Re-run from a specific agent onwards |
| GET | `/:id/progress` | Get workflow step progress |
| GET | `/:id/knowledge` | Get all knowledge items |
| GET | `/:id/knowledge/by-agent/:agentKey` | Get knowledge items for a specific agent |
| GET | `/:id/requirements` | Get functional requirements |
| GET | `/:id/assumptions` | Get assumptions |
| GET | `/:id/questions` | Get clarification questions |
| POST | `/:id/questions/:questionId/answer` | Submit answer to question |
| GET | `/:id/executions` | Get agent executions |
| GET | `/:id/validation` | Get validation issues |
| GET | `/:id/document` | Get compiled document |
| GET | `/:id/stats` | Get project stats |
| GET | `/:id/dashboard` | Get full dashboard snapshot |

### Settings Controller (`/api/settings`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/pipeline` | Get pipeline defaults |
| PUT | `/pipeline` | Update pipeline defaults |

### Aggregate Controller (`/api/aggregate`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/requirements` | All requirements across projects |
| GET | `/validation` | All validation issues across projects |
| GET | `/documents` | All documents across projects |
| GET | `/analytics` | Cross-project analytics |
| GET | `/workflow` | Workflow overview across projects |

### Health Controller (`/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Health check |

## 5. WebSocket Events

Namespace: `/projects`

| Event | Direction | Payload | Description |
|---|---|---|---|
| `join` | Client → Server | `{ projectId }` | Join project room |
| `leave` | Client → Server | `{ projectId }` | Leave project room |
| `agentActivity` | Server → Client | `{ projectId, agentKey, phases }` | Agent progress update |
| `knowledgeCreated` | Server → Client | `{ projectId, items }` | New knowledge items |
| `projectStatus` | Server → Client | `{ projectId, status }` | Project status change |
| `dashboardSnapshot` | Server → Client | `{ projectId, snapshot }` | Full dashboard update |

## 6. Environment Variables

### Required

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | Backend server port |

### LLM Configuration

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `groq` | `groq` or `openai` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `GROQ_API_KEY` | — | Groq API key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model name |
| `OPENAI_API_KEY` | — | OpenAI API key |

### Runtime

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |

## 7. Known Issues & Pitfalls

1. **Theme toggle race condition** — fixed: header toggle now saves to backend, Settings page no longer overrides `next-themes` state on load
2. **Orval codegen staleness** — `lib/api-client-react` types can drift from backend controllers; regenerate with `pnpm codegen`
3. **TypeORM synchronize** — auto-creates/alters tables in development; never use in production without migrations
4. **Groq rate limits** — `GROQ_INPUT_CHAR_BUDGET` is 28k chars; long ideas may need truncation
5. **WebSocket reconnection** — frontend falls back to HTTP polling when WebSocket disconnects; no user-visible error
6. **`lib/db` Drizzle schema** — reference-only, not used by backend (backend uses TypeORM entities); can drift

## 8. Technology Decisions

| Decision | Rationale |
|---|---|
| NestJS (backend) | Enterprise-grade, built-in DI, WebSocket support, TypeScript-native |
| React + Vite (frontend) | Fast dev server, React ecosystem, ShadCN/ui compatibility |
| TypeORM (backend) | Mature PostgreSQL ORM, entity decorator pattern, synchronize for dev |
| Drizzle (lib/db) | Reference schema, not actively used; kept for potential future migration |
| React Query | Server-state management, automatic caching, query invalidation |
| ShadCN/ui | Accessible, themeable components built on Radix primitives |
| Tailwind CSS v4 | Utility-first styling, CSS variable theming |
| Socket.IO | Real-time agent activity streaming with fallback to polling |
| pnpm workspaces | Efficient monorepo dependency management |
| Nx | Build caching, affected commands (not fully leveraged) |

## 9. Conventions

- **Components**: PascalCase, colocated in `components/` or `pages/`
- **Hooks**: `use` prefix, in `hooks/`
- **Backend services**: `*.service.ts`, one per domain
- **Backend controllers**: RESTful, nest under resource name
- **Backend entities**: TypeORM decorators, snake_case columns
- **CSS classes**: Tailwind utilities, semantic color tokens (`bg-card`, `text-foreground`)
- **API responses**: JSON, consistent shape with `id`, `createdAt`, `updatedAt`
- **Error handling**: NestJS `NotFoundException`, `BadRequestException`
