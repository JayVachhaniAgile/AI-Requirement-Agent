# LLM_CONTRACTS.md — AI/LLM Integration Reference

> All LLM provider configuration, prompt patterns, and expected output schemas.

## Provider Configuration

### Resolution Order

1. `LLM_PROVIDER` env var (`groq` or `openai`)
2. If unspecified: auto-detect based on which API key is present
3. Default: `groq` with `llama-3.3-70b-versatile`

### Provider Clients

| Provider | Base URL | Default Model | Budget |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | Full |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 28k chars input, 2k/8k tokens output |

### Configuration

File: `apps/backend/src/llm/llm.service.ts`

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

| Method | Purpose | Max Output Tokens |
|---|---|---|
| `generateStructured(messages)` | JSON schema output | `GROQ_STRUCTURED_MAX_TOKENS` = 2048 |
| `generateText(messages)` | Free-form text output | `GROQ_TEXT_MAX_TOKENS` = 8192 |

- Both methods accept `LLMMessage[]`
- Truncation applies to Groq only when input exceeds `GROQ_INPUT_CHAR_BUDGET` (28,000 chars)
- Error handling: `LlmException` wrapper; agents catch and handle

## Shared Prompts

Located inline within each agent service file in `apps/backend/src/agents/`. Each agent has:
- System prompt defining the agent persona and output schema
- User prompt built by `buildUserPrompt` utility

### Prompt Utility Functions

File: `apps/backend/src/agents/agent.utils.ts`

| Function | Purpose |
|---|---|
| `buildUserPrompt(name, idea, context[])` | Assembles user prompt from project context |
| `formatKnowledge(items, types[])` | Filters and formats knowledge items for LLM |
| `ensureItemIds(items, prefix)` | Assigns sequential IDs (e.g., `FR-001`) |
| `ensureSummary(text, fallback)` | Generates a summary if result is empty |

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

| Agent | Key Types |
|---|---|
| Discovery | `PROBLEM_STATEMENT`, `DOMAIN_MAP`, `SCOPE_DOCUMENT` |
| Research | `RESEARCH_SUMMARY`, `TECHNICAL_LANDSCAPE` |
| Business Analyst | `BUSINESS_REQUIREMENT`, `PROCESS_FLOW` |
| Product Manager | `FEATURE`, `USER_STORY`, `PRODUCT_VISION` |
| Requirements Engineer | `FUNCTIONAL_REQUIREMENT`, `NON_FUNCTIONAL_REQUIREMENT` |
| UX | `WIREFRAME`, `UI_SPEC`, `USER_JOURNEY` |
| Data Architect | `DATA_ENTITY`, `DATA_SCHEMA`, `ER_DIAGRAM` |
| AI Architect | `AI_ARCHITECTURE`, `LLM_SELECTION`, `AI_GUARDRAIL` |
| Solution Architect | `SYSTEM_ARCHITECTURE`, `TECH_STACK`, `API_CONTRACT` |
| Security | `SECURITY_FINDING`, `THREAT_MODEL`, `COMPLIANCE_CHECK` |
| QA | `TEST_PLAN`, `TEST_SCENARIO`, `QUALITY_GATE` |
| Estimation | `EFFORT_ESTIMATE`, `TIMELINE_PROJECTION` |
| Critic | `VALIDATION_SCORES`, `CRITIC_SCORE`, `ISSUE` |
| Debate | `DEBATE_SUMMARY`, `AGENT_POSITION`, `RISKY_ASSUMPTION` |
| Compiler | `COMPILED_DOCUMENT` (now also produces a knowledge item containing the executive summary) |
| FRD Generator | `FRD_DOCUMENT` — Functional Requirements Document (grouped by module/feature, numbered FR-xxx) |
| User Stories Generator | `USER_STORIES_DOCUMENT` — Stories in As a/I want/So that format with Given/When/Then AC |
| Tech Architecture Generator | `TECH_ARCH_DOCUMENT` — HLD with system architecture, tech stack, data flow |
| Database Design Generator | `DB_DESIGN_DOCUMENT` — ER diagrams, SQL schema, indexes, migration strategy |
| API Spec Generator | `API_SPEC_DOCUMENT` — OpenAPI 3.0 style endpoints, schemas, auth, error handling |

## Fallback Behavior

- **LLM call fails**: Agent retries based on `allowRetry` flag; if continues failing, step is marked `FAILED`
- **Zod parse fails**: Agent attempts to re-request with error message appended to prompt; after 1 retry, minimum viable result is returned
- **Rate limited (Groq)**: No automatic retry with backoff currently implemented
- **No API key**: `LlmService` throws on construction; workflow won't start

## Post-Processing

1. Agent parses LLM JSON via Zod schema
2. Knowledge items routed to `RkbService.saveItems()` which persists them
3. Clarification questions routed to the questions repository
4. Compiler agent builds markdown document from all knowledge items
5. Document stats computed by `DashboardService.summarizeMarkdown()`
