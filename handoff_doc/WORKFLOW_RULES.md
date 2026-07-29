# WORKFLOW_RULES.md — Pipeline State Machine & Agent Orchestration

> The 14-agent sequential pipeline that processes software ideas into requirements documents.

## Pipeline Stages

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1. DISCOVERY │──▶│ 2. RESEARCH │──▶│ 3. BUSINESS │──▶│ 4. PRODUCT │
│            │    │            │    │ _ANALYSIS  │    │ _ANALYSIS  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                            │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┘
│ 14. COMPIL- │◀──│ 13. VALIDA- │◀──│ 12. ESTIMA- │◀──│ 5. REQUIRE- │
│ ATION      │    │ TION       │    │ TION       │    │ MENTS_ENG   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                              │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 11. QA_    │◀──│ 10. SECURITY│◀──│ 9. SOLUTION│◀──│ 6. UX_     │
│ PLANNING   │    │ _REVIEW    │    │ _ARCH      │    │ DESIGN     │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                          │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┘
│            │    │ 8. AI_     │◀──│ 7. DATA_   │◀──│            │
│            │    │ ARCH       │    │ ARCHITECT  │    │            │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Total stages:** 14

## State Machine

```
Project Status Flow:
  CREATED → DISCOVERING → RESEARCHING → ANALYSING → GENERATING_REQUIREMENTS
         → DESIGNING → ARCHITECTING → SECURITY_REVIEW → QA_ANALYSIS
         → ESTIMATING → VALIDATING → COMPILING → COMPLETED

  Any state → FAILED (on error)
  Any state → CANCELLED (on user cancel)
  CREATED | FAILED → (restart)
```

### Workflow Step Status

| Status | Meaning |
|---|---|
| `QUEUED` | Waiting for previous step to complete |
| `RUNNING` | Currently executing agent |
| `COMPLETED` | Agent finished successfully |
| `FAILED` | Agent failed with error |

## Agent Mapping

| Stage | Agent Service | Agent Key | Purpose |
|---|---|---|---|
| DISCOVERY | `DiscoveryService` | `discovery` | Analyze idea, extract domain context |
| RESEARCH | `ResearchService` | `research` | Domain research, feasibility |
| BUSINESS_ANALYSIS | `BusinessAnalystService` | `business-analysis` | Business requirements |
| PRODUCT_ANALYSIS | `ProductManagerService` | `product-analysis` | Feature sets, user stories |
| REQUIREMENTS_ENGINEERING | `RequirementsEngineerService` | `requirements-engineering` | Formal requirements |
| UX_DESIGN | `UxService` | `ux-design` | User flows, wireframes |
| DATA_ARCHITECTURE | `DataArchitectService` | `data-architecture` | Data models, schemas |
| AI_ARCHITECTURE | `AiArchitectService` | `ai-architecture` | AI/ML components |
| SOLUTION_ARCHITECTURE | `SolutionArchitectService` | `solution-architecture` | System architecture |
| SECURITY_REVIEW | `SecurityService` | `security-review` | Threat modeling, security |
| QA_PLANNING | `QaService` | `qa-planning` | Test strategy |
| ESTIMATION | `EstimationService` | `estimation` | Effort estimates |
| VALIDATION | `CriticService` | `validation` | Quality review |
| COMPILATION | `CompilerService` | `compilation` | Final document assembly |

## Execution Flow

1. User submits idea via `POST /api/projects` → project created with status `CREATED`
2. User clicks "Start Analysis" → `POST /api/projects/:id/start`
3. `WorkflowService.start()` creates 14 `WorkflowStep` records
4. Pipeline runs sequentially via `setImmediate` (fire-and-forget)
5. Each agent:
   - Sets step status to `RUNNING`
   - Creates `AgentExecution` record
   - Calls LLM via `LlmService`
   - Parses structured JSON output
   - Saves knowledge items via `RkbService`
   - Emits WebSocket events via `WorkflowEventsService`
   - Sets step status to `COMPLETED` or `FAILED`
6. After all agents: `CompilerService` assembles final markdown document
7. Project status set to `COMPLETED`

## Error Handling

- If an agent fails, the step is marked `FAILED` and `project.status` set to `FAILED`
- `errorMessage` is stored on the project entity
- User can resume from the failed stage via `POST /api/projects/:id/start`
- `WorkflowService.prepareResume()` finds the last failed step and restarts from there

## Re-run / Recompile

- `POST /api/projects/:id/recompile` — runs only the `CompilerService` (stage 14)
- Useful after document content changes without re-running the full pipeline

## Real-time Updates

- `WorkflowEventsService` emits events to the WebSocket gateway during pipeline execution
- Frontend subscribes via `useProjectSocket` hook
- Events: `agentActivity`, `knowledgeCreated`, `projectStatus`, `dashboardSnapshot`
- Falls back to HTTP polling (`refetchInterval`) when WebSocket is disconnected
