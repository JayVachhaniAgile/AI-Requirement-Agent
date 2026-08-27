# LLM_CONTRACTS.md — AI/LLM Integration Reference

> All LLM provider configuration, prompt patterns, and expected output schemas.

## Provider Configuration

### Resolution Order

1. `LLM_PROVIDER` env var (`groq`, `openai`, `custom`/`openai-compatible`, or `ollama`)
2. If unspecified: auto-detect based on which API key is present
3. If `CUSTOM_LLM_BASE_URL` is set: `custom`
4. Default: `openai` with `gpt-4o`

### Provider Clients

| Provider | Base URL                               | Default Model             | Budget                               |
| -------- | -------------------------------------- | ------------------------- | ------------------------------------ |
| OpenAI   | `https://api.openai.com/v1`            | `gpt-4o`                  | Full                                 |
| Groq     | `https://api.groq.com/openai/v1`       | `llama-3.3-70b-versatile` | 28k chars input, 2k/8k tokens output |
| Custom   | `CUSTOM_LLM_BASE_URL` (OpenAI-compatible) | `CUSTOM_LLM_MODEL`      | Full                                 |
| Ollama   | `http://localhost:11434/v1`            | `llama3`                  | Full                                 |

### Structured Output Capability Map

File: `apps/server/src/llm/model-compat.ts` — the single place that maps a
provider/model to the structured-output mechanism the API layer must use.
This is what makes model changes safe: a new provider/model gets an explicit
mode instead of silently producing a mismatched payload.

| Provider | Mode | API mechanism |
| -------- | ---- | ------------- |
| OpenAI   | `forced-tools` | `tool_choice` forced tool call |
| Groq     | `forced-tools` | `tool_choice` forced tool call |
| Custom (OpenAI-compatible) | `json-object` | `response_format: json_object` + in-prompt schema hint |
| Ollama   | `prompt-only`  | Prompt-constrained JSON only |

Unknown providers are resolved by model name (`claude*` → `json-object`) and
logged as warnings; unknown models default to `json-object`.

### Configuration

File: `apps/server/src/llm/llm.service.ts`

```typescript
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}
```

### Key Methods

| Method                                           | Purpose                                                        | Max Output Tokens                   |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------- |
| `generateForcedStructured(messages, call, opts)` | Forced tool-use output pinned to an agent's JSON Schema (P0-1) | `DEFAULT_STRUCTURED_MAX_TOKENS` = 4096 |
| `generateStructured(messages, maxRetries?, schema?)` | JSON schema output (optional schema hint)                 | `DEFAULT_STRUCTURED_MAX_TOKENS` = 4096 |
| `generateText(messages)`                         | Free-form text output                                          | `DEFAULT_TEXT_MAX_TOKENS` = 8192      |

- Both methods accept `LLMMessage[]`
- Error handling: `LlmException` wrapper; agents catch and handle
- Per-agent model tiering (P2-2): `LLM_MODEL_HIGH`, `LLM_MODEL_STANDARD`, `LLM_MODEL_FAST` env vars override the default model per tier; see `apps/server/src/llm/agent-model.config.ts`
- When a schema is supplied, `generateStructuredWithModel` injects an in-prompt shape hint
  (`buildSchemaHint`) listing the exact top-level keys and required fields — so even
  `json_object`/`prompt-only` providers emit the agent's contract keys.

### Structured Output Contracts (P0-1)

- Each structured agent has a JSON Schema + forced tool name in `apps/server/src/llm/agent-json-schemas.ts` (`submit_<agent_key>_output`).
- `generateForcedStructured` forces the single tool (`tool_choice`) on OpenAI/Groq; falls back to `response_format: json_schema` (OpenAI) then prompt-constrained JSON (`json_object` + schema hint) if the provider rejects the mechanism.
- For the `custom` provider (e.g. an Anthropic Console gateway), `tool_choice` is often
  rejected in thinking mode — the runtime goes straight to `json_object` + schema hint.
- The tool arguments are the entire payload — no markdown-fence stripping is ever required.
- Every agent's system prompt starts with the shared output contract (`apps/server/src/agents/agent.prompts.ts`): no-padding rule, ID-referential integrity, and a mandatory `lowConfidenceFlags: [{field, reason}]` array in every output schema. Low-confidence flags are persisted to `run_logs` by the agent runner.
- Per-agent `max_tokens` floors follow the fixed-prompts guidance (`AGENT_MAX_TOKENS` in `apps/server/src/llm/agent-model.config.ts`): Requirements Engineer/QA 6000, Debate 5000, Validation 4000, the rest 3000 (Groq stays capped at its structured budget).

### Validation & Retry (P0-2 / P0-3)

- Every agent call is wrapped by `AgentRunnerService`: output is checked by the deterministic validator (`apps/server/src/validation/`) against the agent's contract, failures produce a correction message in the same conversation, capped at 2 retries.
- After the cap, `AgentValidationError` halts the step (no partial data).
- Retry/parse/validation/padding/low-confidence events are persisted to `run_logs` with prompt/schema versions (P2-3/P2-4).

## Shared Prompts

Located inline within each agent service file in `apps/server/src/agents/`. Each agent has:

- System prompt defining the agent persona and output schema
- User prompt built by `buildUserPrompt` utility

### Prompt Utility Functions

File: `apps/server/src/agents/agent.utils.ts`

| Function                                 | Purpose                                     |
| ---------------------------------------- | ------------------------------------------- |
| `buildUserPrompt(name, idea, context[])` | Assembles user prompt from project context  |
| `formatKnowledge(items, types[])`        | Filters and formats knowledge items for LLM |
| `ensureItemIds(items, prefix)`           | Assigns sequential IDs (e.g., `FR-001`)     |
| `ensureSummary(text, fallback)`          | Generates a summary if result is empty      |

## Agent Output Schemas

### ExternalId Handling

All agent Zod schemas now accept `externalId` as optional with `.optional().default("")`. This prevents pipeline crashes when the LLM omits an `externalId` for generated items. The backend generates fallback IDs where needed.

All agents use `z.object()` from Zod for parsing. Agents output structured JSON conforming to their schema.

### Agent Result Type

```typescript
interface AgentResult {
  success: boolean;
  agentKey: string;
  knowledgeItems: NewKnowledgeItem[];
  questions: ClarificationQuestionInput[];
  warnings: string[];
  _tokens: { inputTokens: number; outputTokens: number; model: string };
}
```

### Knowledge Item Types Produced

| Agent                       | Key Types                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Discovery                   | `PROBLEM_STATEMENT`, `DOMAIN_MAP`, `SCOPE_DOCUMENT`                                            |
| Research                    | `RESEARCH_SUMMARY`, `TECHNICAL_LANDSCAPE`                                                      |
| Business Analyst            | `BUSINESS_REQUIREMENT`, `PROCESS_FLOW`                                                         |
| Product Manager             | `FEATURE`, `USER_STORY`, `PRODUCT_VISION`                                                      |
| Requirements Engineer       | `FUNCTIONAL_REQUIREMENT`, `NON_FUNCTIONAL_REQUIREMENT`                                         |
| UX                          | `WIREFRAME`, `UI_SPEC`, `USER_JOURNEY`                                                         |
| Data Architect              | `DATA_ENTITY`, `DATA_SCHEMA`, `ER_DIAGRAM`                                                     |
| AI Architect                | `AI_ARCHITECTURE`, `LLM_SELECTION`, `AI_GUARDRAIL`                                             |
| Solution Architect          | `SYSTEM_ARCHITECTURE`, `TECH_STACK`, `API_CONTRACT`                                            |
| Security                    | `SECURITY_FINDING`, `THREAT_MODEL`, `COMPLIANCE_CHECK`                                         |
| QA                          | `TEST_PLAN`, `TEST_SCENARIO`, `QUALITY_GATE`                                                   |
| Estimation                  | `EFFORT_ESTIMATE`, `TIMELINE_PROJECTION`                                                       |
| Critic                      | `VALIDATION_SCORES`, `CRITIC_SCORE`, `ISSUE`                                                   |
| Debate                      | `DEBATE_SUMMARY`, `AGENT_POSITION`, `RISKY_ASSUMPTION`                                         |
| Compiler                    | `COMPILED_DOCUMENT` (now also produces a knowledge item containing the executive summary)      |
| FRD Generator               | `FRD_DOCUMENT` — Functional Requirements Document (grouped by module/feature, numbered FR-xxx) |
| User Stories Generator      | `USER_STORIES_DOCUMENT` — Stories in As a/I want/So that format with Given/When/Then AC        |
| Tech Architecture Generator | `TECH_ARCH_DOCUMENT` — HLD with system architecture, tech stack, data flow                     |
| Database Design Generator   | `DB_DESIGN_DOCUMENT` — ER diagrams, SQL schema, indexes, migration strategy                    |
| API Spec Generator          | `API_SPEC_DOCUMENT` — OpenAPI 3.0 style endpoints, schemas, auth, error handling               |
| SOW Generator                | `SOW_DOCUMENT` — client-facing Scope of Work: Overview, High-Level Features (feature-by-feature with (New)/(Modification) tags), Notes, Definitions, Questions, Assumptions |

### Gap Analysis Engine

`GapAnalysisService` (`apps/server/src/gap-analysis/`) runs a **single analysis
pass** on demand (`POST /:id/gap-analysis/run`): the `gap-analysis` agent
(structured output, registered in the schema/validation/version/tier registries)
analyzes all artifacts (idea, knowledge base, generated documents) **without
modifying any document** and returns coverage %, quality score, and one finding
per gap with action (KEEP/UPDATE/APPEND/DEPRECATE), affected `section`,
`severity`, optional `confidence`, and `suggestion`. Analysis never re-runs
automatically — re-analysis only happens when the user starts a new run.

Actionable (UPDATE/APPEND) findings become PENDING proposals
(`gap_analysis_proposals`) — one proposal per gap — and the run pauses at
`AWAITING_REVIEW`. The user reviews each gap (document, section, finding,
suggestion, priority, confidence) and clicks **Apply** or **Ignore**. Applying
calls the `gap-patch` agent (structured output, registered in the same
registries): it receives the current document and the single gap and returns a
targeted patch `{mode: REPLACE|APPEND, section, newContent}` — never the full
document. `GapAnalysisService.mergePatch()` merges the patch deterministically
(REPLACE swaps only the matching section's body; unknown sections and APPEND
append new content), and `RkbService.saveDocument()` (called with
`createVersion: false`) updates the existing document and its latest version
**in place** — gap analysis never creates a new document version. After the run
completes, actionable findings can still be applied directly from the Findings
list via `POST /:id/gap-analysis/findings/:findingKey/apply` (`findingKey` is
`iteration:index`), which records an APPLIED proposal so prior-analysis context
stays consistent. When every proposal is resolved the run finalizes as
`COMPLETED`; the workflow's GAP_ANALYSIS stage watcher finalizes the project.
Live progress (phase + iteration) is persisted in `gap_analysis_active_runs` and
streamed over Socket.IO (`gap.analysis.progress`) with a 3s polling fallback, so
a page refresh never stops or hides an in-progress run. Every run is persisted
in `gap_analysis_runs` (findings + metrics), and each finding includes a
plain-language `explanation` for non-technical stakeholders.

### Document Generation Layer (enterprise prompts)

The 6 document generators (`frd`, `user-stories`, `tech-arch`, `db-design`, `api-spec`, `sow`) use the
Enterprise AI Document Generation prompts (`apps/server/src/agents/document.prompts.ts`): a shared
Global Instruction (implementation-ready, cover full lifecycle, infer missing scenarios, document
assumptions) prepended to each per-document prompt (FRD, User Stories, HLD, Database Design, API Spec).
A **drift check** (`apps/server/src/validation/document-drift.ts`) extracts ID tokens from each
generated markdown document and compares them against the source JSON ID set. The SOW generator
enforces every `FEAT-*`/`MOD-*` feature appears in the document. `DocumentRunnerService`
enforces completeness: missing source IDs (silent omission) trigger a correction request in the same
conversation (max 2 retries) and fail the stage if still missing — an incomplete document is never
saved. Invented IDs (possible inference under the enterprise prompts) are logged and persisted to
`run_logs` as `drift` events — flagged, never blocking.

## Fallback Behavior

- **LLM call fails**: Agent retries based on `allowRetry` flag; if continues failing, step is marked `FAILED`
- **Zod parse fails**: Handled by `AgentRunnerService` — the parse error becomes a correction message and is retried (max 2 retries); on exhaustion the step fails rather than returning a minimum viable result
- **Forced tool-use rejected (400)**: `generateForcedStructured` falls back to prompt-constrained JSON for that call
- **Schema shape mismatch**: the in-prompt schema hint (`buildSchemaHint`) keeps the model on
  the agent's exact top-level keys even when the API layer cannot force the shape.
- **Rate limited (Groq)**: No automatic retry with backoff currently implemented
- **No API key**: `LlmService` throws on construction; workflow won't start

## CI Guardrails

- `pnpm --filter @workspace/server check:schema` compiles `apps/server/scripts/check-schema-compat.ts`
  and verifies every agent in `AGENT_VALIDATION_CONFIGS` has a registered, serializable JSON
  Schema whose required fields all exist in `properties`, plus a valid `MODEL_COMPAT` mode.
  Run it locally before pushing provider/model changes.

## Post-Processing

1. Agent parses LLM JSON via Zod schema
2. Knowledge items routed to `RkbService.saveItems()` which persists them
3. Clarification questions routed to the questions repository
4. Compiler agent builds markdown document from all knowledge items
5. Document stats computed by `DashboardService.summarizeMarkdown()`
