# FULL_SYSTEM_FLOW.md — End-to-End System Flow

> Single-source narrative of the entire Crystallize system, from idea input to
> delivered requirements. Each section explains: **what business logic runs**,
> **what inputs it consumes**, and **what outputs it produces**. Per-topic docs
> for deep detail: CONTEXT.md, WORKFLOW_RULES.md, DAG_WORKFLOW.md,
> DATA_MODEL.md, LLM_CONTRACTS.md, PROCESS_FIXES.md, PIPELINE_CONFIG.md.

---

## 1. Idea Input & Project Creation

**Business purpose:** Turn a raw software idea into a trackable project entity
that can be picked up by the pipeline.

Input
- Project name (string)
- Idea / description (free text markdown)
- (Optional) domain tag

Logic
- `POST /api/projects` → `ProjectsService.create()`
- If no domain is supplied, `DomainService.detectDomain()` runs an LLM call to
  classify the idea into one of 16 supported domains (e.g. "Healthcare Platform"
  → `HEALTHCARE`), so downstream agents can bias their prompts.
- A **Project** row is written with `status: CREATED` and `domain` set.

Output
- New project row → dashboard card.
- `canStart = true` enables the **Start Analysis** button.
- No pipeline steps are created yet (lazy initialization happens in `startRun`).

---

## 2. Pipeline Launch

**Business purpose:** Begin the multi-agent analysis. Cancels any prior runs to
guarantee a clean single-source-of-truth execution, then seeds every pipeline
step with a `PENDING` status so the UI knows the exact initial state.

Input
- User click: **Start Analysis**, **Generate Documents**, or **Resume**
- Project ID, optionally a `definitionKey` (defaults to `crystallize-pipeline`)

Logic
- `ProjectsService.start()`:
  - If the project was `WAITING_FOR_USER` (post-discovery checkpoint), requires
    `discoveryCheckpoint.isConfirmed()` — blocks re-start until the user has
    reviewed the AI’s interpretation.
  - Rejects start if `project.status` is not in `RESTARTABLE_STATUSES`
    (`CREATED | FAILED | WAITING_FOR_USER | PAUSED | GAP_ANALYSIS_REVIEW | COMPLETED`).
  - `isFresh / isFullRerun` → calls `dagEngine.startProject(id)`.
  - Otherwise (paused / failed / awaiting) → calls `dagEngine.resumeProject(id)`.
- `startProject()` (replaces the old sequential `createWorkflowSteps`):
  - `cancelActiveRuns()` flips every prior `PENDING/RUNNING/PAUSED/WAITING_/_APPROVAL/FAILED`
    run to `CANCELLED` so no orphaned executions interfere.
  - Sets `project.status = DISCOVERING`, `currentStage = DISCOVERY` so the
    header bar and workflow view know we’re entering Discovery.
  - `startRun()` creates a new `workflow_dag_runs` row (`status: PENDING`) and
    **one `workflow_dag_node_runs` row per DAG node** — all `status: PENDING`,
    with `dependsOn`, `checkpoint`, `maxRetries`, and `timeoutMs` populated from
    the plan.
  - `executeRun()` flips the **run** `PENDING → RUNNING`, then begins executing
    level-by-level.

Output
- New `workflow_dag_runs` row with fresh `PENDING` nodes.
- `project.status = DISCOVERING`.
- WebSocket broadcast `dag.run.updated` + initial `dag.node.updated` x N.
- Frontend shows **Pause** and (conditionally) **Approve** buttons.

---

## 3. DAG Execution Loop — Layer-by-Layer Parallel Execution

**Business purpose:** Execute the 20-agent pipeline efficiently by running
independent agents in parallel (layer / level), while preserving dependency
ordering. This is what makes the pipeline fast compared to the old sequential
approach.

Input
- A valid execution plan (from `generatePlan()` — Kahn's algorithm).
- Run ID with nodes in `PENDING` state.

Logic
- `DagEngineService.executeFromLevel()`:
  - Reads run; if `PAUSED` or `CANCELLED`, stops immediately (graceful).
  - For each level (all nodes at the same depth = independent dependencies):
    - Marks each node `PENDING → RUNNING` before executing.
    - Executes eligible nodes in parallel via `Promise.all` (batch size =
      `concurrency`, default **3**). This is the parallelism that speeds up the
      pipeline — e.g. UX, Data Architecture, and AI Architecture all run at once.
    - Node result transitions: `RUNNING → COMPLETED | FAILED | WAITING_APPROVAL`.
  - After all nodes in a layer resolve:
    - If any **required** node `FAILED` → run status = `FAILED`, stops; downstream
      nodes remain `PENDING` (user can regenerate from the failure point).
    - If any node is intentionally `SKIPPED` (optional path) → downstream
      optionals also skip (skip cascade).
    - If any node `WAITING_APPROVAL` → run status = `WAITING_APPROVAL`, pauses;
      user must approve before continuing.
    - Else advances to the next level.
  - On final layer success → `run.status = COMPLETED`, `project.status = COMPLETED`.

Output
- All node statuses advance (`PENDING → RUNNING → COMPLETED`).
- Run status progresses.
- WebSocket `dag.node.updated` for each transition; `dag.run.updated` for run status.
- `project.status` mirrors the active stage (e.g. `ANALYSING` during Business
  Analysis).

---

## 4. Agent Execution — Per-Node Work

**Business purpose:** Each of the 20 agents produces structured output (knowledge
items, questions, documents) that downstream agents consume. This is where the
actual AI “thinking” happens.

Input
- `AgentContext` (project name, idea, domain, knowledge items, answered
  questions, ContextEngine-ranked context digest)
- Agent-specific Zod schema (for forced tool output)

Logic
- `DagAgentExecutorAdapter.executeNode()`:
  1. `buildContext()` — assembles the `AgentContext` by fetching:
     - Project metadata
     - Knowledge items via `RkbService.getKnowledgeContext(projectId)`
     - Answered questions via `RkbService.getAnsweredQuestions()`
     - ContextEngine-ranked artifacts (`contextEngine.compile()`)
     - Applies `AGENT_DIGEST_CONFIG` tiering — upstream agents pass full detail,
       distant agents get reduced summaries (externalId + title + one-liner).
     - For validation/debate nodes: surfaces `conflicts_with` pairs from the
       knowledge graph.
  2. Model resolution via `ModelRouterService`:
     - Reads `LLM_PROVIDER` → resolves to provider.
     - Checks per-tier env overrides (`LLM_MODEL_HIGH / STANDARD / FAST`)
     - Falls back to provider default (`OLLAMA_MODEL`, `GROQ_MODEL`, `OPENAI_MODEL`).
     - Falls back to hardcoded `DEFAULT_MODEL = "gpt-4o"`.
  3. Calls the agent service (e.g., `DiscoveryService.run(ctx)`).
     - Agent sends messages to the LLM with structured output schema.
     - Uses forced tool call (OpenAI/Groq) or json_object + in-prompt schema
       hint (Ollama/custom).
     - Validates response with Zod. On failure → retry with feedback (max 2 retries).
  4. On success:
     - Saves knowledge items via `RkbService.saveKnowledgeItems()` (tagged with
       `createdBy` agentKey).
     - Saves questions via `RkbService.saveQuestions()`.
     - Saves validation issues via `RkbService.saveValidationIssues()`.
     - Saves document via `RkbService.saveDocument()` if the agent produces one
       (FRD, User Stories, Tech Arch, DB Design, API Spec, SOW, Compiled).
     - Emits `dag.node.updated` to WebSocket.
     - If `checkpoint: true` → node becomes `WAITING_APPROVAL`.

Output
- Knowledge items persisted in `knowledge_items` table.
- Questions persisted in `questions` table (if blocking).
- Documents persisted in `documents` table (Version 1 on first save).
- Validation issues in `validation_issues` table.
- WebSocket delta to frontend.

---

## 5. Checkpoint Gate — Discovery Approval

**Business purpose:** Give the human a chance to review and correct the AI’s
interpretation of their idea before the entire downstream pipeline commits to
it. This prevents wasted LLM calls on a misunderstood concept.

Input
- Discovery agent completes with:
  - `ideaInterpretation`, `problemStatement`, `proposedSolution`, `initialScope`
  - Blocking questions (user must answer before proceeding)

Logic
- `DagEngineService.runLayer()` detects the checkpoint node succeeded and
  `checkpoint: true` → sets `run.status = WAITING_APPROVAL`.
- `project.status` updated to stage-derived status (Discovery checkpoint →
  `DISCOVERING`).
- WebSocket `dag.run.updated` + `dag.node.updated` broadcast to project room.

Frontend — `DiscoveryCheckpointCard`
- Conditionally rendered when:
  - `project.status === "WAITING_FOR_USER"` OR
  - `dagRun.status === "WAITING_APPROVAL"`
- Presents:
  - Editable textareas for the interpretation fields (user can correct the AI).
  - Blocking questions with answer inputs (must be answered).
  - "Looks Right — Continue" button (disabled until all blocking Qs answered).
- On confirm → `POST /api/projects/:id/discovery-confirmation`
- Backend: `confirmDiscovery()` → validates checkpoint → calls `resumeProject()`:
  - Auto-approves the checkpoint node.
  - Resumes pipeline from the next level (Research).
  - The corrected interpretation is what Research and all downstream agents receive.

Output
- Run resumes (`WAITING_APPROVAL → RUNNING`).
- Downstream agents begin execution with the confirmed context.
- WebSocket `dag.run.updated` fires.
- `DiscoveryCheckpointCard` unmounts from the UI.

---

## 6. Pause / Resume / Cancel

**Business purpose:** Let users pause long-running pipelines (e.g. to answer
questions, fix issues, or step away) and resume later, or abandon entirely.

Input
- UI button click (Pause, Resume, Cancel, Approve)
- Run ID + (optionally) node key

Logic
| Action | Backend API | What it does |
|---|---|---|
| **Pause** | `POST /api/dag/runs/:runId/pause` | Sets run `PAUSED`. Current node **completes first**; pipeline halts before next level. Nodes at current/next levels stay `PENDING`. |
| **Resume** | `POST /api/dag/runs/:runId/resume` | `resume()` → resets nodes from the target level to `PENDING` (preserving `SKIPPED`); run flips back to `RUNNING`. |
| **Cancel** | `POST /api/projects/:id/cancel` | `cancelProject()` → flips all active runs to `CANCELLED`; project status → `CANCELLED`. |
| **Approve** | `POST /api/dag/runs/:runId/nodes/:nodeKey/approve` | `approveCheckpoint()` → marks checkpoint node `COMPLETED`; resumes pipeline from next level. |

Output
- Run status transitions (`PAUSED ↔ RUNNING ↔ WAITING_APPROVAL ↔ CANCELLED`).
- WebSocket `dag.run.updated` for each transition.
- Frontend buttons swap based on `dagRun.status` (Pause only shows during
  RUNNING/PENDING; Resume only when PAUSED/FAILED; Approve only when
  WAITING_APROVAL; New Run only when COMPLETED/CANCELLED).

---

## 7. Regenerate / Recompile

**Business purpose:** Let users redo work from a specific stage (if the AI
produced a bad result) or regenerate just the final compiled document, without
re-running everything.

Input
- Agent key (e.g. `requirements-engineering`)
- Project ID

Logic
- `POST /api/projects/:id/regenerate/:agentKey` →
  `DagEngineService.regenerateNode(projectId, nodeKey)`:
  1. Looks up the **latest run** for this project.
  2. Resolves `nodeKey → level` via `levelOf(plan, nodeKey)`.
  3. `resetFromLevel()` sets **all nodes from that level onward** to `PENDING`:
     - Clears `outputJson`, `error`, `retryCount`, `startedAt`, `completedAt`.
     - Preserves `SKIPPED` nodes (don’t un-skip intentional skips).
     - Sets `run.currentLevel = level`.
  4. `executeRun()` resumes from that level.
- **Recompile** (`POST /api/projects/:id/recompile`):
  - Only resets the `compilation` node → `PENDING`.
  - Re-runs the Compiler.
- **Build Prompt regeneration**:
  - `POST /api/projects/:id/dag/regenerate-build-prompt`
  - Only resets the `build-prompt` node.

Frontend — `AgentDetailsModal`:
- **Regenerate** button on each agent card (opened via node click — see
  PROCESS_FIXES.md §4 for the click-handler wiring).
- Calls `POST /api/projects/:id/regenerate/:agentKey`.
- `showAgentModal` / `agentModalKey` state controls open/close.

Output
- Nodes from the target level reset to `PENDING`.
- Run resumes — downstream agents re-execute.
- **Document versioning:** only the regenerated document gets a new version
  (e.g. FRD v2). Other documents keep existing versions. Versions are
  **per-document** (`project_id` + `document_type`), not per-project.
- Gap-analysis Apply actions update the existing document in place (never
  create a new version).

---

## 8. Document Generation & Versioning

**Business purpose:** Produce the final deliverables — requirements documents,
architectural diagrams, and a compiled summary — that the user can read, share,
and download.

Input
- Knowledge items from all agents (functional requirements, assumptions,
  user stories, validation issues, etc.)
- Document templates / compiler logic

Logic
- `CompilerService` runs after the `compilation` node.
- If `FOUNDATION_COMPILER_AUTO=true`, auto-compiles when the compilation node
  completes.
- **Seven document generators** run as a **parallel layer** after Compilation:
  `frd`, `user-stories`, `tech-arch`, `db-design`, `api-spec`, `sow`, and
  `build-prompt` (artifact).
- `gap-analysis` runs **after all document generators** complete.
- Version numbers are **per-document** (`project_id` + `document_type`):
  - Initial generation → **Version 1**.
  - Regenerate/recompile → new version **only for that document**.
  - Gap-analysis "Apply" → updates existing version in place (no new version).

Output
- Documents stored in `documents` table with version tracking.
- `DocumentVersion` rows store snapshots for diff viewing.
- Frontend: document viewer tabs (7 types), version history with diff viewer,
  MD + DOCX download. (PDF export is stub/partial.)

---

## 9. Real-time Updates

**Business purpose:** Provide live feedback so users see progress without
manually refreshing. Keep the entire pipeline state in sync across tabs and
collaborators.

Input
- Any backend state change (node completion, run status, new knowledge items)

Logic
- `DagRealtimeBridge` forwards every persisted state change to the project's
  WebSocket room:
  | Event | Payload | When it fires |
  |---|---|---|
  | `dag.node.updated` | `{ projectId, runId, nodeKey, status, retryCount, error, at }` | Every node status change |
  | `dag.run.updated` | `{ projectId, runId, status, currentLevel, currentNodeKey, at }` | Run-level status changes |
  | `projectStatus` | `{ projectId, status, currentStage, errorMessage }` | Project status mirror |
  | `dashboardSnapshot` | Full dashboard payload | Periodic/refresh |
  | `agentActivity` | `{ projectId, agentKey, stage, message, level, knowledgeItems }` | Per-agent log messages |
  | `knowledgeCreated` | `{ projectId, items, agentKey }` | When knowledge items are saved |

- Frontend `useProjectSocket(id)` subscribes to all project-room events.
- On delta: `queryClient.setQueryData` merges partial state instantly (no refetch).
- Poll-based fallback (`refetchInterval`) when WebSocket disconnects.
- All state updates flow into React Query + Zustand stores; UI re-renders reactively.

Output
- Node cards update in real time (status colors, spinners, completion checkmarks).
- Live panel (`AgentLivePanel`) shows the active agent’s streaming output.
- Dashboard counters update (e.g. "12/20 agents completed").
- Knowledge items appear in the Requirements tab as they’re created.

---

## Provider Config (inline)

**Business purpose:** Route LLM calls to the correct provider/model per agent
based on capability tier and configuration, with sensible fallbacks.

Resolution chain per request:
1. Explicit `LLM_PROVIDER` env var (openai | groq | ollama | custom).
2. Provider auto-detection if unset (checks API keys / base URLs in priority order).
3. Per-agent model tier override (`LLM_MODEL_HIGH / LLM_MODEL_STANDARD / LLM_MODEL_FAST`).
4. Provider default model (`OLLAMA_MODEL`, `GROQ_MODEL`, `OPENAI_MODEL`).
5. Hardcoded fallback: `DEFAULT_MODEL = "gpt-4o"` in `model-router.policy.ts`.

| Provider | Key env | Model env | Default model |
|---|---|---|---|
| openai | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4o` |
| groq | `GROQ_API_KEY` | `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| ollama | (none) | `OLLAMA_MODEL` | `llama3` |
| custom | `CUSTOM_LLM_API_KEY` | `CUSTOM_LLM_MODEL` | `custom-model` |

Agent tier assignments: `apps/server/src/llm/agent-model.config.ts`:
- `high`: requirements-engineering, solution-architecture, validation, debate
- `fast`: research, estimation
- `standard`: all others (discovery, ba, pm, ux, data, ai, security, qa, gap-analysis)

## 10. Full 23-Agent Flow — What Each Agent Takes, Does, and Produces

> Business logic for every agent in pipeline order (source of truth: `apps/server/src/dag-engine/pipeline.config.ts`). Each row answers three questions: **what it takes** (inputs), **what it does** (logic), **what it produces** (outputs). Distant upstream knowledge items are auto-digested to `externalId`/`title`/one-line description (P1-1); only immediate upstream agents pass full detail.

### Pipeline Layer Map

The pipeline is a DAG with 9 logical layers (which expand into 15 execution levels in `DagEngineService`). Layers 1–7 contain the structured agents; the 6 document generators + build-prompt generator all run in **parallel** (Layer 8) after Compilation, then Gap Analysis gates alone in Layer 9.

| Layer | Stage Keys | What runs | Parallelism |
|---|---|---|---|
| 1 | DISCOVERY | discovery | 1 (checkpoint — pauses for approval) |
| 2 | RESEARCH | research | 1 |
| 3 | BUSINESS_ANALYSIS + PRODUCT_ANALYSIS | business-analysis, product-analysis | 2 (both depend only on discovery + research) |
| 4 | REQUIREMENTS_ENGINEERING | requirements-engineering | 1 |
| 5 | UX_DESIGN + DATA_ARCHITECTURE + AI_ARCHITECTURE | ux-design, data-architecture, ai-architecture | 3 (independent deps) |
| 6 | SOLUTION_ARCHITECTURE | solution-architecture | 1 |
| 7 | SECURITY_REVIEW + QA_PLANNING + ESTIMATION + VALIDATION + DEBATE + COMPILATION | security-review, qa-planning, estimation, validation, debate, compilation | partial — solution-architecture gates security & qa; validation/debate are global; compilation gates all docs |
| 8 | 6 DOCUMENT GENERATORS (FRD, USER_STORIES, TECH_ARCH, DB_DESIGN, API_SPEC, SOW) + BUILD_PROMPT | frd, user-stories, tech-arch, db-design, api-spec, sow, build-prompt | 7 parallel (all depend only on compilation) |
| 9 | GAP_ANALYSIS | gap-analysis | 1 (final gate) |

### Agent Flow Table

| # | Stage | Agent Key | Service | Tier | Takes (Inputs) | Does (Logic) | Produces (Outputs) |
|---|---|---|---|---|---|---|---|
| 1 | DISCOVERY | `discovery` | `DiscoveryService` | standard | Project idea (text), project name, domain classification | LLM structured analysis of the raw idea; extracts problem, solution, scope, facts, goals, users, risks, and **blocking questions**; auto-detects domain | Knowledge items: `CONFIRMED_FACT` (FACT-*), `ASSUMPTION`, `BUSINESS_GOAL` (BG-*), `USER_GOAL` (UG-*), `USER_TYPE` (USER-*), `RISK` (ASM-*); `DISCOVERY_SUMMARY` | questions: blocking questions (must be answered before checkpoint confirm) | **Checkpoint: pipeline pauses at `WAITING_FOR_USER`** — user must confirm/edit interpretation + answer blocking Qs via `POST /api/projects/:id/discovery-confirmation` before downstream agents run. |
| 2 | RESEARCH | `research` | `ResearchService` | fast | Confirmed discovery facts, business goals, problem statement, scope, user goals, assumptions; raw idea | LLM market/technology landscape analysis; competitor profiling; tech stack + API suggestions; compliance + standards scan; risk identification | Knowledge items: `RESEARCH_SUMMARY`, `COMPETITOR` (COMP-*), `TECHNOLOGY_SUGGESTION` (TECH-*), `API_RESEARCH` (API-*), `COMPLIANCE_NOTE` (COMPL-*), `INDUSTRY_STANDARD` (STD-*), `RESEARCH_RISK` (RRISK-*) | — | No checkpoint. |
| 3 | BUSINESS_ANALYSIS | `business-analysis` | `BusinessAnalystService` | standard | Discovery + Research (full detail); idea | Derives business problem, objectives, stakeholders; translates discovery into formal business requirements (BR), business rules, constraints, scope (in/out); risk + assumption extraction | Knowledge items: `BA_SUMMARY`, `BUSINESS_OBJECTIVE` (BO-*), `STAKEHOLDER` (STK-*), `BUSINESS_REQUIREMENT` (BR-*), `BUSINESS_RULE` (RULE-*), `CONSTRAINT`, `BUSINESS_RISK` (RISK-*), `ASSUMPTION`, `SCOPE` | — | Runs before Product Analysis (PM schema references BR-* IDs). |
| 4 | PRODUCT_ANALYSIS | `product-analysis` | `ProductManagerService` | standard | Discovery + Research + Business Analysis (full detail); idea | Product vision, value proposition, user personas (PER-*); module (MOD-*) + feature (FEAT-*) breakdown with priority tiers; MVP scope; success metrics | Knowledge items: `PRODUCT_VISION`, `VALUE_PROPOSITION`, `PERSONA` (PER-*), `MODULE` (MOD-*), `FEATURE` (FEAT-*), `MVP_SCOPE`, `SUCCESS_METRIC` | — | Features reference `relatedBR` (BR-* from BA) — dependency enforced by P1-2 lock. |
| 5 | REQUIREMENTS_ENGINEERING | `requirements-engineering` | `RequirementsEngineerService` | high | Product Analysis + Business Analysis (full detail); BR-* / FEAT-* refs | Transforms features + business requirements into formal functional requirements (FR-*) with acceptance criteria (Given/When/Then), validation rules, error conditions, actors, modules; generates user stories (US-*) referencing FR-* | Knowledge items: `FUNCTIONAL_REQUIREMENT` (FR-*, max 20), `USER_STORY` (US-*) | — | Self-references US → FR (both produced here). Highest quality-tier model (`high`). |
| 6a | UX_DESIGN | `ux-design` | `UxService` | standard | Requirements Engineering + Product Analysis (full detail) | UX personas, end-to-end user journeys; screen breakdown; navigation flow; UX guidelines; accessibility requirements; wireframe descriptions | Knowledge items: `UX_SUMMARY`, `UX_PERSONA` (UXP-*), `USER_JOURNEY` (JOURNEY-*), `SCREEN` (SCR-*), `UX_GUIDELINE` (UXG-*), `ACCESSIBILITY_REQUIREMENT` (A11Y-*), `WIREFRAME` (WF-*) | — | |
| 6b | DATA_ARCHITECTURE | `data-architecture` | `DataArchitectService` | standard | UX Design + Requirements Engineering (full detail) | ER model overview; entity/table definitions (TBL-*); relationships (REL-*); constraints; indexes (IDX-*); data dictionary (DD-*) | Knowledge items: `DATABASE_DESIGN`, `DB_TABLE` (TBL-*), `DB_RELATIONSHIP` (REL-*), `DB_CONSTRAINT` (DCON-*), `DB_INDEX` (IDX-*), `DATA_DICTIONARY` (DD-*) | — | |
| 6c | AI_ARCHITECTURE | `ai-architecture` | `AiArchitectService` | standard | Data Architecture + UX Design (full detail) | AI/ML pipeline design; LLM selection (LLM-*); prompt strategy (PROMPT-*); embeddings (EMB-*); vector store (VEC-*); memory/context (MEM-*); guardrails (GRD-*) | Knowledge items: `AI_ARCHITECTURE`, `LLM_SELECTION` (LLM-*), `PROMPT_STRATEGY` (PROMPT-*), `EMBEDDING_DESIGN` (EMB-*), `VECTOR_STORE` (VEC-*), `AI_MEMORY` (MEM-*), `AI_GUARDRAIL` (GRD-*) | — | |
| 7 | SOLUTION_ARCHITECTURE | `solution-architecture` | `SolutionArchitectService` | high | AI Architecture + Data Architecture + UX Design (full detail) | Holistic system architecture; components (CMP-*); API contracts (API-SPEC-*); event/queue flows (EVT-*); infrastructure (INF-*); deployment topology (DEP-*); logging/monitoring (OBS-*) | Knowledge items: `SOLUTION_ARCHITECTURE`, `SYSTEM_COMPONENT` (CMP-*), `API_SPEC` (API-SPEC-*), `EVENT_FLOW` (EVT-*), `INFRASTRUCTURE` (INF-*), `DEPLOYMENT` (DEP-*), `OBSERVABILITY` (OBS-*) | — | Highest quality-tier model. Gates Security & QA stages. |
| 8a | SECURITY_REVIEW | `security-review` | `SecurityService` | standard | Solution + AI + Data Architecture (full detail); solution FRD/FR/FACT refs | Authn/authz (SEC-AUTH-*); OWASP findings (OWASP-*); encryption/secrets (SEC-ENC-*); API security (SEC-API-*); compliance (SEC-COMP-*); threat model (THREAT-*) | Knowledge items: `SECURITY_REPORT`, `SECURITY_AUTH` (SEC-AUTH-*), `OWASP_FINDING` (OWASP-*), `SECURITY_ENCRYPTION` (SEC-ENC-*), `API_SECURITY` (SEC-API-*), `SECURITY_COMPLIANCE` (SEC-COMP-*), `THREAT_MODEL` (THREAT-*) | — | |
| 8b | QA_PLANNING | `qa-planning` | `QaService` | standard | Security Review + Solution Architecture (full detail) | Test strategy; test plan items; functional tests (TP-*); test cases (TC-*); regression suites (REG-*); performance tests (PERF-*); security tests (STEST-*) | Knowledge items: `QA_PLAN`, `TEST_PLAN_ITEM` (TP-*), `TEST_CASE` (TC-*), `REGRESSION_TEST` (REG-*), `PERFORMANCE_TEST` (PERF-*), `SECURITY_TEST` (STEST-*) | — | |
| 8c | ESTIMATION | `estimation` | `EstimationService` | fast | QA Planning + Security Review (full detail) | Complexity assessment; team composition (TEAM-*); timeline (TIME-*); cost estimate (COST-*); sprint plan (SPRINT-*); estimation risks (ERISK-*) | Knowledge items: `ESTIMATION_REPORT`, `TEAM_ROLE` (TEAM-*), `TIMELINE` (TIME-*), `COST_ESTIMATE` (COST-*), `SPRINT_PLAN` (SPRINT-*), `ESTIMATION_RISK` (ERISK-*) | — | Fast-tier model. |
| 8d | VALIDATION | `validation` | `CriticService` | high | **ALL** knowledge items (global digest — no immediate upstream config) | Cross-domain quality validation; 12-dimension scoring (business completeness → testability, 0–10 each); issue identification across all prior agents; identifies gaps, contradictions, low-traceability | Knowledge items: `VALIDATION_SCORES` | validation issues: severity/priority/affected IDs/source agent/recommended correction/responsible agent | Result ∈ `PASS | CONDITIONAL_PASS | FAIL`. High-tier model. |
| 8e | DEBATE | `debate` | `DebateService` | high | **ALL** knowledge items + conflicts from knowledge graph + all prior agents' `lowConfidenceFlags` | Multi-perspective debate on contradictions; validates assumptions raised as low-confidence; synthesizes findings into overall readiness rating (LOW/MEDIUM/HIGH) | Knowledge items: `DEBATE_SUMMARY`, `AGENT_POSITION`, `RISKY_ASSUMPTION` | validation issues: contradictions (HIGH severity, requires human decision) + medium/high-risk assumptions | High-tier model. Feeds Gap Analysis. |
| 8f | COMPILATION | `compilation` | `CompilerService` | standard | All domain agents' items (RE, SA, PA, BA, QA, Est — full detail); idea; domain info | Assembles all knowledge items into a single structured markdown document; LLM generates executive summary (250–400 words); all stored facts included at full length (no truncation) | Knowledge items: `COMPILED_DOCUMENT` | `documentContent`: full compiled markdown (sections 1–N, DoD, etc.) | Triggers 7 document generators when `FOUNDATION_COMPILER_AUTO=true`. |
| 9a | FRD_GENERATION | `frd` | `FrdService` | standard | RE + PA + BA + UX (full detail); FR-* IDs | Generates Functional Requirements Document using enterprise document prompts; **drift check** ensures every FR-* ID appears in the output | Knowledge items: `FRD_DOCUMENT` | `documentContent`: FRD markdown | Document ID pattern: `FR-\d+`. Retries up to 2× on missing IDs. |
| 9b | USER_STORIES_GENERATION | `user-stories` | `UserStoriesService` | standard | PA + RE + UX (full detail); US-* IDs | Generates User Stories document with acceptance criteria; drift check for US-* IDs; appends "Missing / Uncovered Items" section for traceability | Knowledge items: `USER_STORIES_DOCUMENT` | `documentContent`: User stories markdown | Document ID pattern: `US-\d+`. |
| 9c | TECH_ARCH_GENERATION | `tech-arch` | `TechArchService` | standard | SA + AI + Data + Security (full detail); CMP-* IDs | Generates Technical Architecture document (HLD); drift check for CMP-* component IDs | Knowledge items: `TECH_ARCH_DOCUMENT` | `documentContent`: Tech arch markdown | Document ID pattern: `CMP-\d+`. |
| 9d | DB_DESIGN_GENERATION | `db-design` | `DbDesignService` | standard | Data + RE + SA (full detail); TBL-* IDs | Generates Database Design document; drift check for TBL-* table IDs | Knowledge items: `DB_DESIGN_DOCUMENT` | `documentContent`: DB design markdown | Document ID pattern: `TBL-\d+`. |
| 9e | API_SPEC_GENERATION | `api-spec` | `ApiSpecService` | standard | SA + Data + RE (full detail); API-SPEC-* IDs | Generates API Specification document; drift check for API-SPEC-* endpoint IDs | Knowledge items: `API_SPEC_DOCUMENT` | `documentContent`: API spec markdown | Document ID pattern: `API-SPEC-\d+`. |
| 9f | SOW_GENERATION | `sow` | `SowService` | standard | PA + Est + BA + RE (full detail); MOD-* + FEAT-* IDs | Generates Statement of Work; chunks features (3 per chunk) through `sow-chunk` prompts, merges via `sow-merge` prompt; drift check enforces every FEAT-* and MOD-* appears | Knowledge items: `SOW_DOCUMENT` | `documentContent`: SOW markdown | Document ID patterns: `FEAT-\d+`, `MOD-\d+`. Chunks features to fit prompt budgets. |
| 9g | BUILD_PROMPT_GENERATION | `build-prompt` | `CompilerService.buildPrompt()` | standard | **ALL** knowledge items (full — immediateUpstream `*`); idea; domain info | Generates developer-ready build prompt: technology stack, LLM/AI notes, data model, API contracts, UI screens, security, testing, 9-step build instructions, Definition of Done checklist | Knowledge items: `BUILD_PROMPT_DOCUMENT` | `documentContent`: Build prompt markdown | Not a customer-facing doc — a developer handoff artifact. |
| 10 | GAP_ANALYSIS | `gap-analysis` | `GapAnalysisService` | standard | All artifacts: idea, full knowledge base, all 7 generated documents | Single-pass gap analysis: computes coverage % + quality score; emits findings with action (KEEP/UPDATE/APPEND/DEPRECATE), section, severity, confidence, suggestion; actionable findings → proposals → pause at `AWAITING_REVIEW`; `gap-patch` agent applies targeted patches | Knowledge items: `GAP_ANALYSIS` summaries (iterations) | findings (KEEP/UPDATE/APPEND/DEPRECATE) + proposals (PENDING → APPLIED) | Applies patches **in-place** (`createVersion: false`) — never creates a new document version. Streams progress via Socket.IO `gap.analysis.progress`. |

### Knowledge Item ID Prefix Ownership

Single source of truth: `apps/server/src/dag-engine/pipeline.config.ts` → `ID_PREFIX_PRODUCERS`. The P1-2 `assertNoForwardReferences()` lock uses this to guarantee no agent references IDs from a future agent.

| Prefix(es) | Produced By | Agent Stage |
|---|---|---|
| `FACT`, `ASM`, `BG`, `UG`, `USER` | DiscoveryService | DISCOVERY |
| `COMP`, `TECH`, `API`, `COMPL`, `STD`, `RRISK` | ResearchService | RESEARCH |
| `BO`, `STK`, `BR`, `RULE`, `RISK`, `ASM-B` | BusinessAnalystService | BUSINESS_ANALYSIS |
| `PER`, `MOD`, `FEAT` | ProductManagerService | PRODUCT_ANALYSIS |
| `FR`, `US` | RequirementsEngineerService | REQUIREMENTS_ENGINEERING |
| `UXP`, `JOURNEY`, `SCR`, `UXG`, `A11Y`, `WF` | UxService | UX_DESIGN |
| `TBL`, `REL`, `DCON`, `IDX`, `DD` | DataArchitectService | DATA_ARCHITECTURE |
| `LLM`, `PROMPT`, `EMB`, `VEC`, `MEM`, `GRD` | AiArchitectService | AI_ARCHITECTURE |
| `CMP`, `API-SPEC`, `EVT`, `INF`, `DEP`, `OBS` | SolutionArchitectService | SOLUTION_ARCHITECTURE |
| `SEC-AUTH`, `OWASP`, `SEC-ENC`, `SEC-API`, `SEC-COMP`, `THREAT` | SecurityService | SECURITY_REVIEW |
| `TP`, `TC`, `REG`, `PERF`, `STEST` | QaService | QA_PLANNING |
| `TEAM`, `TIME`, `COST`, `SPRINT`, `ERISK` | EstimationService | ESTIMATION |
| `VAL` | CriticService | VALIDATION |
| *(findings)* | GapAnalysisService | GAP_ANALYSIS |

### Document Generation Drift-Check Patterns

Documents are generated via `DocumentRunnerService` which enforces that the output markdown contains every source ID. Invented IDs are logged (informational); missing IDs trigger retries (max 2) and ultimately fail the stage.

| Document Agent | Source ID Pattern(s) | Source Knowledge Item Types |
|---|---|---|
| `frd` | `FR-\d+` | `FUNCTIONAL_REQUIREMENT` |
| `user-stories` | `US-\d+` | `USER_STORY` |
| `tech-arch` | `CMP-\d+` | `SYSTEM_COMPONENT` (from solution-arch) |
| `db-design` | `TBL-\d+` | `DB_TABLE` (from data-arch) |
| `api-spec` | `API-SPEC-\d+` | `API_SPEC` (from solution-arch) |
| `sow` | `FEAT-\d+`, `MOD-\d+` | `FEATURE`, `MODULE` (from product-analysis) |
| `build-prompt` | *(no patterns — free-form)* | All knowledge items (`*`) |
| `compilation` | *(no patterns — free-form)* | All knowledge items |

### Agent Model Tiering & Token Budgets

From `apps/server/src/llm/agent-model.config.ts`. Tier selects the model via `LLM_MODEL_HIGH / LLM_MODEL_STANDARD / LLM_MODEL_FAST` env vars (falling back to provider default). `max_tokens` floors are per-agent; Groq stays capped by its structured budget.

| Agent Key | Tier | max_tokens |
|---|---|---|
| discovery | standard | 3000 |
| research | fast | 3000 |
| business-analysis | standard | 3000 |
| product-analysis | standard | 3000 |
| requirements-engineering | **high** | 6000 |
| ux-design | standard | 3000 |
| data-architecture | standard | 3000 |
| ai-architecture | standard | 3000 |
| solution-architecture | **high** | 3000 |
| security-review | standard | 3000 |
| qa-planning | standard | 6000 |
| estimation | fast | 3000 |
| validation | **high** | 4000 |
| debate | **high** | 5000 |
| gap-analysis | standard | 3000 |
| gap-patch | standard | 3000 |
| *(document generators)* | standard | 3000 each |

