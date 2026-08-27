# BUILD_PROMPT.md — Developer-Ready Build Prompt for Prompt Builder Framework

> Complete setup, usage, and implementation guide for the Prompt Builder framework.

## Project Identity

This is the **Prompt Builder Framework** — a centralized prompt generation system for the Crystallize requirements platform. It replaces scattered inline prompt definitions with a declarative, versioned template engine used by all 14 structured AI agents and 6 document generators.

**Status:** Core (Discovery + FRD) **done**, remaining 12 agents + 5 document types **not started**.

## Architecture Overview

```
Author-time (TS):  src/prompts/templates/**  +  src/prompts/blocks/
                              |
                              v
Runtime:  TemplateRegistry -> PromptBuilderService (render + compose)
                              |-> PromptVersionerService (content-hash versions)
                              v
            LLMMessage[] -> LlmService / AgentRunner (existing, untouched)
                              |
                              v
Persistence: prompt_templates | prompt_versions | prompt_test_runs
```

## Directory Structure

```
apps/server/src/prompts/
|-- blocks/
|   |-- shared-output-contract.ts    # Shared output contract block
|   |-- enterprise-global.ts         # Enterprise global instruction block
|   `-- index.ts                     # Blocks registry
|-- templates/
|   |-- structured/
|   |   `-- discovery.ts              # Discovery agent template (migrated)
|   |-- documents/
|   |   `-- frd.ts                    # FRD document template (migrated)
|   `-- examples/
|       `-- discovery.example.ts      # Few-shot examples (opt-in)
|-- prompt-builder.service.ts        # Pure builder service
|-- prompt-versioner.service.ts      # Content-hash versioner
|-- prompt-builder.spec.ts           # Unit specs
|-- prompt-versioner.spec.ts         # Unit specs
|-- prompts.controller.ts            # Debug REST endpoints
|-- prompts.module.ts                # NestJS module
|-- prompts.service.ts               # REST layer + snapshotting
|-- template-registry.ts             # Template loading + introspection
|-- template.types.ts                # DSL types + definePrompt()
```

## Setup & Installation

### 1. Prerequisites

- Node.js >=18
- PostgreSQL (local or cloud)
- LLM API key (Groq or OpenAI)

### 2. Backend Environment Setup

```bash
# Navigate to backend
cd apps/server

# Install dependencies
pnpm install

# Create .env from example
cp .env.example .env

# Edit .env with your configuration
# Example .env:
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/autonomous_ai
PORT=3000
NODE_ENV=development

LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

### 3. Start Services

```bash
# Terminal 1: Backend
cd apps/server && pnpm run dev

# Terminal 2: Frontend (if needed for testing)
cd apps/client && pnpm run dev
```

Open `http://localhost:5173` for the frontend.

## Core Components & APIs

### PromptBuilderService

The main service that assembles LLMMessage[] from declarative templates.

**Exported Functions:**

```typescript
// High-level: build messages for agents by agentKey + AgentContext
buildAgentMessages('discovery', ctx): LLMMessage[]

// High-level: build messages for document generators by docType
buildDocumentMessages('frd', input): LLMMessage[]

// Runtime: build messages from template + vars (low-level)
buildMessages(template, vars): LLMMessage[]

// Compose prompt parts with variable interpolation
composeParts(parts, vars): string

// Render single prompt part (resolve blocks, interpolate {{var}})
renderPart(part, vars): string

// Preview messages without LLM call
previewMessages(promptKey, vars): {
  system: string;
  user: string;
  fewShot: Array<{role: string; content: string}>;
}
```

**Usage Examples:**

```typescript
import { buildAgentMessages, buildDocumentMessages } from './prompt-builder.service';

// For Discovery agent (structured output)
const agentMessages = buildAgentMessages('discovery', {
  projectId: 'proj-123',
  projectName: 'Task Tracker',
  idea: 'A task management app with users, tasks, and due dates.',
  domain: 'productivity',
  answeredQuestions: [
    { question: 'Target platform?', answer: 'Web' }
  ]
});

// For FRD document generator
const docMessages = buildDocumentMessages('frd', {
  projectId: 'proj-123',
  projectName: 'Task Tracker',
  idea: 'A task management app with users, tasks, and due dates.',
  knowledgeItems: [
    {
      type: 'FUNCTIONAL_REQUIREMENT',
      externalId: 'FR-001',
      title: 'User Authentication',
      description: 'Users can create accounts and log in'
    }
  ]
});
```

### PromptVersionerService

Deterministic content-hash version service.

```typescript
// Get version for a template
getVersion(templateKey: string): string
// Format: v<MAJOR>.<MINOR>-<hash8>
```

### Template Registry

Single source of truth for all prompt templates.

```typescript
// Load a specific template by key
const template = getTemplate('agent:discovery');

// List all templates
const allTemplates = listTemplates();

// Check if template exists
const exists = hasTemplate('document:frd');
```

## Template DSL (Domain Specific Language)

### Core Types

```typescript
// A prompt part: literal string (with {{var}} and @block: refs) or render function
export type PromptPart = string | ((vars: PromptVars) => string);

// Template with stable key, kind, system/user prompts, variables, versioning
export interface PromptTemplate {
  key: string;                    // 'agent:discovery' | 'document:frd'
  kind: 'agent' | 'document';
  description?: string;
  system: PromptPart | PromptPart[];      // Array joined by '\n\n'
  user?: PromptPart | PromptPart[];       // Optional user prompt
  fewShot?: FewShotExample[];             // In-context learning examples
  variables?: Record<string, PromptVariableSpec>; // Variable contract
  version?: { major?: number; minor?: number };   // Manual semantic version
  resolveVars?: (input: PromptVars) => PromptVars; // Map AgentContext to template vars
}
```

### Block System

Shared fragments referenced via `@block:name`.

**Available Blocks:**

```typescript
// @block:shared.output-contract
// Mandatory output contract for ALL structured agents

// @block:enterprise.global
// Enterprise global instruction for ALL document generators
```

**Example Block Usage:**

```typescript
template = {
  key: 'agent:discovery',
  kind: 'agent',
  system: ['@block:shared.output-contract', OUTLINE],
  // Other properties...
}
```

### Template Definition Pattern

```typescript
import { definePrompt } from './template.types';

const myTemplate = definePrompt({
  key: 'agent:discovery',
  kind: 'agent',
  description: 'Discovery agent — interpret the software idea',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUserFunction,
  fewShot: discoveryFewShotExamples,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    domain: { type: 'string' },
    answeredQuestions: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
```

## Data Model

Three database tables for prompt persistence:

### prompt_templates
- `id`: UUID (PK)
- `prompt_key`: varchar(100) UNIQUE
- `kind`: varchar(32) — 'agent' | 'document'
- `content`: text — Serialized PromptTemplate JSON
- `content_hash`: varchar(32) — Auto content hash
- `variables_json`: text — Variable contract (nullable)
- `metadata`: text — JSON (nullable)
- `created_at / updated_at`: timestamptz

### prompt_versions
- `id`: UUID (PK)
- `prompt_key`: varchar(100)
- `version`: varchar(64) — e.g. `v1.1-<hash8>`
- `content_hash`: varchar(32)
- `schema_version`: varchar(32) — For structured agents (P2-4)
- `diff`: text — Nullable change description
- `created_by`: varchar(100) — Nullable actor
- `created_at`: timestamptz

### prompt_test_runs
- `id`: UUID (PK)
- `prompt_key`: varchar(100)
- `version`: varchar(64)
- `sample_key`: varchar(100) — Nullable test sample
- `result`: varchar(32) — 'pass' | 'fail' | 'snapshot'
- `assertions_json`: text — Nullable test assertions
- `created_at`: timestamptz

## Testing & Validation

### Unit Tests

```bash
# Run all prompt builder tests
cd apps/server && pnpm run test:unit

# Run specific service tests
pnpm run test:unit prompt-builder
pnpm run test:unit prompt-versioner
```

**Test Coverage Areas:**

- Variable interpolation: `{{var}}` replacement
- Block resolution: `@block:name` references
- Array formatting: Knowledge items -> Q/A format
- Few-shot assembly: Examples inserted correctly
- Template composition: System/user message assembly
- Edge cases: Missing variables, undefined values

### Example Test Patterns

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeParts } from './prompt-builder.service';

test('interpolates string variables', () => {
  const out = composeParts('Hello {{name}}', { name: 'World' });
  assert.equal(out, 'Hello World');
});

test('block references resolve from shared registry', () => {
  const out = composeParts('@block:shared.output-contract\n\n{{project}}', {
    project: 'Task Tracker'
  });
  assert.ok(out.includes('OUTPUT CONTRACT'));
});

test('discovery template produces correct messages', () => {
  const messages = buildAgentMessages('discovery', CTX);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
});
```

### Golden-Dataset Validation

```bash
# Run golden-dataset eval (needs running backend + DB + LLM key)
cd apps/server && pnpm run eval:golden

# Dry-run to preview what would be tested
cd apps/server && pnpm run eval:golden -- --dry-run
```

## Debugging & Introspection

### REST API Endpoints

```bash
# List all templates
GET /api/prompts

# Get full template by key
GET /api/prompts/agent:discovery

# Preview rendered messages with sample variables
POST /api/prompts/preview
Body: { key: 'agent:discovery', vars: { projectName: 'Demo' } }

# Snapshot current templates into DB (idempotent)
POST /api/prompts/snapshot
```

### Example Debug Workflow

```bash
# Preview discovery agent prompt
curl -X POST http://localhost:3000/api/prompts/preview \
  -H "Content-Type: application/json" \
  -d '{
    "key": "agent:discovery",
    "vars": {
      "projectName": "Task Tracker",
      "idea": "A task management app",
      "domain": "productivity"
    }
  }'

# List all templates with versions
curl http://localhost:3000/api/prompts
```

## Migration Guide

### From Inline Prompts to Templates

**Before (inline in agent service):**

```typescript
// Inline system prompt + user prompt + manual message array
const SYSTEM_PROMPT = `@block:shared.output-contract
\nYou are an expert Discovery Agent...`;

const messages = [{ role: 'system', content: SYSTEM_PROMPT + '\n\n' + OUTLINE }];
```

**After (template-based):**

```typescript
// In agent service
import { buildAgentMessages } from '../prompts/prompt-builder.service';

const messages: LLMMessage[] = buildAgentMessages('discovery', ctx);
```

### Migration Steps for New Agents

1. Create `src/prompts/templates/structured/<agent-key>.ts`
2. Define template with `definePrompt()`
3. Register in `template-registry.ts`
4. Replace inline message building with `buildAgentMessages()`
5. Run tests to verify identical output
6. Run `pnpm run test:unit` and `pnpm run typecheck`

### Document Generator Migration

1. Create `src/prompts/templates/documents/<doc-type>.ts`
2. Define template with `definePrompt()`
3. Register in `template-registry.ts`
4. Replace inline prompt building with `buildDocumentMessages()`
5. Run tests to verify identical output

## Best Practices

### Prompt Design

1. **Single Responsibility** — Each template serves one agent/document purpose
2. **Variable Contract** — Declare all expected variables in `variables` section
3. **Block Reuse** — Share common content via `@block:` references
4. **Test Coverage** — Write snapshot tests for rendered prompts
5. **Versioning** — Bump manual version on content changes
6. **Schema Alignment** — Match template variables to agent validation contracts

### Development Workflow

1. **Read AGENTS.md first** — project conventions are strict
2. **Use pure functions** — PromptBuilderService has no Nest dependencies
3. **Test thoroughly** — unit tests cover all interpolation/block scenarios
4. **Verify output** — ensure generated messages match expected format
5. **Update documentation** — keep PROMPT_BUILDER.md and template-registry in sync

### Common Pitfalls

| Error | Cause | Fix |
|---|---|---|
| `Unknown prompt block` | Block not in registry | Check `src/prompts/blocks/index.ts` |
| `Unknown prompt template` | Key not registered | Update `template-registry.ts` |
| Tests failing | Content drift | Review rendered output expectations |
| Variable interpolation missing | Variable not declared | Add to template.variables |

## Next Steps

1. Migrate remaining 12 structured agents to templates
2. Migrate 5 document generators (user-stories, tech-arch, db-design, api-spec, sow) to templates
3. Wire `prompt_test_runs` recording into golden-dataset eval
4. Add snapshot-diff detection when content_hash changes
5. Auto-attach few-shot examples from `templates/examples/`

---

**Reference Docs:** `AGENTS.md` (entry) -> `handoff_doc/PROMPT_BUILDER.md` (framework)

## Document Type Migration Reference

The following table lists all document generators and their migration status. Each document type gets its own template file and has a clear migration section below.

| Document Type | Agent Service | Template Status | Template Key |
|---|---|---|---|
| FRD_DOCUMENT | `frd.service.ts` | **done** | `document:frd` |
| USER_STORIES_DOCUMENT | `user-stories.service.ts` | **not started** | `document:user-stories` |
| TECH_ARCH_DOCUMENT | `tech-arch.service.ts` | **not started** | `document:tech-arch` |
| DB_DESIGN_DOCUMENT | `db-design.service.ts` | **not started** | `document:db-design` |
| API_SPEC_DOCUMENT | `api-spec.service.ts` | **not started** | `document:api-spec` |
| SOW_DOCUMENT | `sow.service.ts` | **not started** | `document:sow` |
| BUILD_PROMPT_DOCUMENT | `compiler.service.ts` | **done** | `document:build-prompt` |
| COMPILED_DOCUMENT | `compiler.service.ts` | **not started** | `document:compiled` |

### Tab: FRD Document (`document:frd`) — DONE

**Source:** `apps/server/src/prompts/templates/documents/frd.ts`

**Pattern:**
- System: `@block:enterprise.global` + `FRD_DOCUMENT_PROMPT` string
- User: Render function with `projectName`, `idea`, `knowledgeItems`
- Variables: `projectName`, `idea`, `knowledgeItems`

**Migration:** Already complete. Use `buildDocumentMessages('frd', ctx)` in `frd.service.ts`.

### Tab: User Stories Document (`document:user-stories`) — TEMPLATE

**Source:** `apps/server/src/agents/user-stories.service.ts`

**Template scaffold (create `src/prompts/templates/documents/user-stories.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const USER_STORIES_PROMPT = `You are a Senior Product Owner and Business Analyst.

Generate a comprehensive User Stories document...`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete User Stories document...`;
}

export const userStoriesTemplate = definePrompt({
  key: 'document:user-stories',
  kind: 'document',
  description: 'User Stories document generator — user stories with acceptance criteria.',
  system: ['@block:enterprise.global', USER_STORIES_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

**Migration step:** Register `userStoriesTemplate` in `template-registry.ts`, replace inline prompt building in `user-stories.service.ts` with `buildDocumentMessages('user-stories', ctx)`.

### Tab: Tech Architecture Document (`document:tech-arch`) — TEMPLATE

**Source:** `apps/server/src/agents/tech-arch.service.ts`

**Template scaffold (create `src/prompts/templates/documents/tech-arch.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const TECH_ARCH_PROMPT = `You are a Principal Solutions Architect and Lead Software Architect.

Generate a comprehensive Technical Architecture document...`;

function renderUser(vars: Record<string, unknown>): string {
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${vars.projectName}\n\nOriginal Idea:\n${vars.idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Technical Architecture document covering HLD, system components, architecture diagrams (Mermaid), deployment architecture, and more.`;
}

export const techArchTemplate = definePrompt({
  key: 'document:tech-arch',
  kind: 'document',
  description: 'Technical Architecture (HLD) document generator.',
  system: ['@block:enterprise.global', TECH_ARCH_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

### Tab: Database Design Document (`document:db-design`) — TEMPLATE

**Source:** `apps/server/src/agents/db-design.service.ts`

**Template scaffold (create `src/prompts/templates/documents/db-design.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const DB_DESIGN_PROMPT = `You are a Senior Data Architect and Database Engineer.

Generate a comprehensive Database Design document...`;

function renderUser(vars: Record<string, unknown>): string {
  // Same knowledge-items rendering pattern as other documents
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${vars.projectName}\n\nOriginal Idea:\n${vars.idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Database Design document covering ER diagrams, schema design (Mermaid), data dictionaries, indexing strategy, and more.`;
}

export const dbDesignTemplate = definePrompt({
  key: 'document:db-design',
  kind: 'document',
  description: 'Database Design document generator.',
  system: ['@block:enterprise.global', DB_DESIGN_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

### Tab: API Spec Document (`document:api-spec`) — TEMPLATE

**Source:** `apps/server/src/agents/api-spec.service.ts`

**Template scaffold (create `src/prompts/templates/documents/api-spec.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const API_SPEC_PROMPT = `You are a Principal API Architect and Backend Engineer.

Generate a comprehensive API Specification document...`;

function renderUser(vars: Record<string, unknown>): string {
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${vars.projectName}\n\nOriginal Idea:\n${vars.idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete API Specification covering OpenAPI/Swagger format, endpoint catalog with request/response schemas (JSON), authentication, rate limiting, and more.`;
}

export const apiSpecTemplate = definePrompt({
  key: 'document:api-spec',
  kind: 'document',
  description: 'API Specification document generator.',
  system: ['@block:enterprise.global', API_SPEC_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

### Tab: Build Prompt Document (`document:build-prompt`) — DONE

**Source:** `apps/server/src/agents/compiler.service.ts`

The `buildPrompt` method generates a standalone developer-ready build prompt document that users can copy into any AI coding assistant (Claude, ChatGPT, Cursor, Copilot, etc.) to build the project from scratch.

**Pipeline Stage:** `BUILD_PROMPT_GENERATION` (after `SOW_GENERATION`, before `GAP_ANALYSIS`)
**Document Type:** `BUILD_PROMPT_DOCUMENT`

**Content includes:**
- **Role** — senior full-stack engineering team assignment
- **Product Brief** — idea, scope/MVP, personas, functional requirements, constraints
- **Technology Stack** — recommended tech, LLM/AI selections, infrastructure
- **Data Model** — entities/tables, relationships, constraints, indexes, data dictionary
- **API Specification** — endpoints, contracts, events/queues
- **User Interface** — screens, journeys, UX guidelines
- **Security** — auth, encryption, compliance, threat model
- **Quality & Testing** — test plan & cases, validation findings
- **Build Instructions** — 9 numbered steps (scaffold, data, API, frontend, AI, tests, CI, README, verify)
- **Definition of Done** — 8-item checklist

**Access:** Available in the Documents tab alongside SOW (positioned beside it).

### Tab: SOW Document (`document:sow`) — TEMPLATE

**Source:** `apps/server/src/agents/sow.service.ts`

**Template scaffold (create `src/prompts/templates/documents/sow.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const SOW_PROMPT = `You are a Senior Project Manager and Engagement Lead.

Generate a comprehensive Scope of Work (SOW) document...`;

function renderUser(vars: Record<string, unknown>): string {
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${vars.projectName}\n\nOriginal Idea:\n${vars.idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Scope of Work document covering project objectives, deliverables, milestones, timeline, budget, acceptance criteria, roles and responsibilities, risk register, and more.`;
}

export const sowTemplate = definePrompt({
  key: 'document:sow',
  kind: 'document',
  description: 'Scope of Work document generator.',
  system: ['@block:enterprise.global', SOW_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```


### Tab: Development Prompt (DEVELOPMENT_PROMPT)

> Ready-to-use system prompt for AI coding assistants working on Crystallize. Copy this entire prompt into any AI assistant's system prompt before developing on this project.

---

You are a senior full-stack developer working on **Crystallize** — a monorepo (pnpm + Nx) with a NestJS/TypeScript backend and React + Vite frontend. Complete user requests with surgical precision, following strict architectural conventions.

## Project Identity & Non-Negotiables

- **Backend:** `apps/server/src/` — NestJS with TypeORM (PostgreSQL)
- **Frontend:** `apps/client/src/` — React + Vite + Tailwind CSS + ShadCN/ui
- **Generated API client:** `lib/api-client-react/src/generated/` — **DO NOT MODIFY** (orval-generated); regenerate with `pnpm codegen`
- **All backend routes are prefixed with `/api`** — all frontend API calls must use this prefix
- **Never commit changes** unless explicitly asked
- **Never add copyright/license headers**
- **No inline comments** in code unless explicitly requested
- **No one-letter variable names** (use `i` only inside `.map`/`for` contexts)

## Critical: Read Before Touching Code

If not already loaded into context, read these docs in order:

1. `handoff_doc/AGENTS.md` — entry point, agent rules, read order
2. `handoff_doc/CONTEXT.md` — architecture, endpoints, env vars, conventions
3. `handoff_doc/DATA_MODEL.md` — DB entities, relationships, column details
4. `handoff_doc/WORKFLOW_RULES.md` — 22-stage pipeline state machine
5. `handoff_doc/LLM_CONTRACTS.md` — LLM config, schemas, output contracts
6. `handoff_doc/PROMPT_BUILDER.md` — prompt builder framework
7. `BUILD_PROMPT.md` — build and migration reference

**Do not hallucinate.** If the docs don't mention a route, env var, or config, it doesn't exist. Never invent.

## Pipeline: 22-Stage Sequential Agents

The core value of this project is the 22-stage pipeline (14 structured agents + 8 document stages). You cannot break or shortcut the order. Pipeline stages run in this fixed sequence:

1. DISCOVERY → 2. RESEARCH → 3. BUSINESS_ANALYSIS → 4. PRODUCT_ANALYSIS → 5. REQUIREMENTS_ENGINEERING → 6. UX_DESIGN → 7. DATA_ARCHITECTURE → 8. AI_ARCHITECTURE → 9. SOLUTION_ARCHITECTURE → 10. SECURITY_REVIEW → 11. QA_PLANNING → 12. ESTIMATION → 13. VALIDATION → 14. DEBATE → 15. COMPILATION (+ GAP_ANALYSIS + 6 document stages)

Pipeline order is locked: `apps/server/src/workflow/pipeline.config.ts` — `assertNoForwardReferences()` fails if any schema references an agent that runs later. Business Analysis runs before Product Analysis (PM schema references `BR-*` IDs from BR output).

**After DISCOVERY:** pipeline pauses at `WAITING_FOR_USER` — blocking questions must be answered before `POST /:id/discovery-confirmation` resumes.

## LLM Contracts (P0-1, P0-2, P0-3)

Structured output is mandatory for all structured agents. The forced-tool mechanism is in `apps/server/src/llm/model-compat.ts`.

- When changing models: update `apps/server/src/llm/model-compat.ts` and run `pnpm --filter @workspace/server check:schema`
- Every agent's system prompt starts with `@block:shared.output-contract` (source: `src/prompts/blocks/shared-output-contract.ts`) — no padding rule, ID-referential integrity, mandatory `lowConfidenceFlags: [{field, reason}]`
- `generateForcedStructured` validates each agent attempt; retry-with-feedback (max 2 retries) then `AgentValidationError`
- Custom providers in thinking mode reject `tool_choice` — runtime uses `json_object` + `buildSchemaHint`. Must list real top-level keys from `schema.properties`, never `Object.keys(schema)`.

## Data Model Rules

- snake_case columns with TypeORM decorators (`@Entity`, `@PrimaryGeneratedColumn`, etc.)
- `synchronize: true` auto-creates tables in dev — never use in production
- Document versions are per-document (project_id + document_type); Version 1 on initial generation, new version only per regenerated document
- `validation_score` column on `documents` is NOT set by `saveDocument()` to avoid overriding AI confidence with version numbers
- Gap analysis patches apply in-place — no new version created
- Each agent has canonical `externalId` prefixes: FACT-* (Discovery), BR-* (Business), FR-* (Requirements), FEAT-* (Product, etc.)

## Prompt Builder Framework

Templates live in `apps/server/src/prompts/templates/`. Each template uses `definePrompt()` with:
- `key`: `agent:<agentKey>` or `document:<docType>`
- `kind`: `'agent'` or `'document'`
- `system`: array of PromptPart (strings with `@block:` refs + `{{var}}` refs, or render functions), joined by `\n\n`
- `user`: render function for user message
- `variables`: declared variable contract
- `version`: `{ major, minor }` — bump minor on content changes
- `resolveVars`: maps AgentContext to template vars (usually identity)

Migration pattern: Replace inline `SYSTEM_PROMPT` + `USER_PROMPT` + manual `messages` array with:
```
const messages: LLMMessage[] = buildAgentMessages('<agentKey>', ctx);
// or for documents:
const messages: LLMMessage[] = buildDocumentMessages('<docType>', input);
```
Register every template in `template-registry.ts`.

## Coding Standards

- Backend: One NestJS service per domain (`*.service.ts`), controllers under resource name, entities in `database/entities/`
- Frontend: ShadCN/ui components in `components/ui/`, pages in `pages/`, hooks prefixed with `use`
- Frontend: React Query for server state, no Redux or Zustand; `useProjectSocket` for real-time events
- CSS: Tailwind utility classes, semantic color tokens (`bg-card`, `text-foreground`), CSS variable theming
- API responses: JSON with consistent shape (`id`, `createdAt`, `updatedAt`)
- Error handling: NestJS `NotFoundException`, `BadRequestException`

## Testing

- `cd apps/server && pnpm run test:unit` — backend unit tests
- `pnpm run test:unit prompt-builder` — prompt builder tests
- `pnpm run typecheck` — TypeScript (baseline 22 pre-existing errors)
- `pnpm --filter @workspace/server check:schema` — verify agent schemas/compat registration
- `pnpm lint` — repo-wide ESLint
- `pnpm format` — repo-wide Prettier

## Validation Guardrails

- `check:schema` verifies every agent in `AGENT_VALIDATION_CONFIGS` has a registered, serializable JSON Schema with required fields in `properties` plus a valid `MODEL_COMPAT` mode
- `agent-keys.spec.ts` — every `agentKey` passed to `AgentRunnerService.run()` must have registered validation config + schema
- `agent-versions.spec.ts` — prompt/schema versioning consistency

## WebSocket Contract

- Socket.IO on `/projects` namespace, project rooms
- Events: `agentActivity`, `knowledgeCreated`, `projectStatus`, `dashboardSnapshot`
- Frontend: `useProjectSocket` hook; falls back to HTTP polling when disconnected
- Gateway config: `origin: true` for CORS
- Do not break WebSocket event payloads — frontend depends on exact field names

## Workflow Actions

| Method | Route | Description |
|---|---|---|
| POST | `/api/projects/:id/start` | Start/resume pipeline |
| POST | `/api/projects/:id/pause` | Pause pipeline |
| POST | `/api/projects/:id/regenerate/:agentKey` | Re-run from specific agent |
| POST | `/api/projects/:id/recompile` | Run only CompilerService |
| POST | `/api/projects/:id/discovery-confirmation` | Confirm discovery, resume pipeline |
| POST | `/api/projects/:id/gap-analysis/run` | Single-pass gap analysis |

Status transitions: CREATED → DISCOVERING → RESEARCHING → ANALYSING → ... → COMPILING → COMPLETED. On failure: step FAILED, project FAILED, resume via POST /start.

## Environment

| Variable | Default | Required |
|---|---|---|
| `DATABASE_URL` | — | Yes |
| `PORT` | 3000 | No |
| `NODE_ENV` | development | No |
| `LLM_PROVIDER` | openai (auto-detected) | No |
| `GROQ_API_KEY` | — | If using Groq |
| `OPENAI_API_KEY` | — | If using OpenAI |
| `LLM_MODEL_HIGH` / `_STANDARD` / `_FAST` | — | No |

## Commands

```bash
# Start backend
cd apps/server && pnpm run dev

# Start frontend
cd apps/client && pnpm run dev

# Build all
pnpm run build

# Type check all packages
pnpm run typecheck

# Backend unit tests
cd apps/server && pnpm run test:unit

# Lint + format
pnpm lint
pnpm lint:fix
pnpm format

# Schema guardrail (run before pushing model changes)
pnpm --filter @workspace/server check:schema

# Golden dataset eval
cd apps/server && pnpm run eval:golden
```

## Key Files (Bookmark These)

| File | Purpose |
|---|---|
| `apps/server/src/workflow/pipeline.config.ts` | Pipeline order + agent keys |
| `apps/server/src/llm/agent-json-schemas.ts` | Structured output JSON schemas |
| `apps/server/src/validation/agent-validation.config.ts` | Per-agent validation contracts |
| `apps/server/src/llm/agent-model.config.ts` | Per-agent LLM tier + max tokens |
| `apps/server/src/llm/model-compat.ts` | Provider/mode mapping |
| `apps/server/src/workflow/workflow.service.ts` | Pipeline orchestration |
| `apps/server/src/agents/agent-runner.service.ts` | Agent execution + retry + validation |
| `apps/server/src/agents/document-runner.service.ts` | Document generation runner |
| `apps/server/src/prompts/` | Prompt templates and builder |
| `apps/server/src/rkb/rkb.service.ts` | Knowledge base save/load |
| `apps/server/src/compiler/compiler.service.ts` | Final document assembly |

## Task Approach

1. Plan first — use the plan tool for multi-step work; break into 5-7 word steps
2. Surgical changes — fix root cause, minimal and focused
3. Test immediately — run relevant unit tests after each change
4. Verify formatting — run `pnpm format:check` and fix issues
5. Update docs — if you add an endpoint update CONTEXT.md; if you change agent behavior update WORKFLOW_RULES.md + LLM_CONTRACTS.md; if you change the data model update DATA_MODEL.md; keep PROMPT_BUILDER.md in sync

## Common Mistakes to Avoid

- Modifying `lib/api-client-react/src/generated/` instead of regenerating
- Using wrong `externalId` prefixes
- Breaking pipeline order (P1-2 lock enforced in tests)
- Creating a new document version when gap-analysis should apply in-place
- Inventing API endpoints that don't exist in docs
- Missing `lowConfidenceFlags` in agent outputs (mandatory field)
- Not registering new schemas/templates — causes `check:schema` failures

---

### Tab: Compiled Document (`document:compiled`) — TEMPLATE

**Source:** `apps/server/src/agents/compiler.service.ts`

The compiler assembles the final compiled markdown document from all knowledge items. It uses a simpler prompt structure:

```typescript
import { definePrompt } from '../../template.types';

const COMPILED_PROMPT = `You are a senior documentation engineer. Assemble a complete, coherent requirements document from all the knowledge items below. ...`;

function renderUser(vars: Record<string, unknown>): string {
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
    metadata?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${vars.projectName}\n\nOriginal Idea:\n${vars.idea}\n\nKnowledge Items:\n${items}\n\nAssemble into a complete markdown requirements document.`;
}

export const compiledTemplate = definePrompt({
  key: 'document:compiled',
  kind: 'document',
  description: 'Compiled final document generator.',
  system: ['@block:enterprise.global', COMPILED_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

## Agent Migration Reference

| Agent | Agent Key | Template Status | Template Key |
|---|---|---|---|
| Discovery | `discovery` | **done** | `agent:discovery` |
| Research | `research` | **not started** | `agent:research` |
| Business Analyst | `business-analysis` | **not started** | `agent:business-analysis` |
| Product Manager | `product-analysis` | **not started** | `agent:product-analysis` |
| Requirements Engineer | `requirements-engineering` | **not started** | `agent:requirements-engineering` |
| UX Designer | `ux-design` | **not started** | `agent:ux-design` |
| Data Architect | `data-architecture` | **not started** | `agent:data-architecture` |
| AI Architect | `ai-architecture` | **not started** | `agent:ai-architecture` |
| Solution Architect | `solution-architecture` | **not started** | `agent:solution-architecture` |
| Security | `security-review` | **not started** | `agent:security-review` |
| QA Planner | `qa-planning` | **not started** | `agent:qa-planning` |
| Estimation | `estimation` | **not started** | `agent:estimation` |
| Critic | `validation` | **not started** | `agent:validation` |
| Debate | `debate` | **not started** | `agent:debate` |
| Gap Analysis | `gap-analysis` | **not started** | `agent:gap-analysis` |
| Gap Patch | `gap-patch` | **not started** | `agent:gap-patch` |

### Tab: Research Agent (`agent:research`) — TEMPLATE

**Source:** `apps/server/src/agents/research.service.ts`

**Template scaffold (create `src/prompts/templates/structured/research.ts`):**

```typescript
import { definePrompt } from '../../template.types';

const RESEARCH_OUTLINE = `You are an expert Research Agent...

Produce JSON with exactly these fields:
- marketOverview, competitorMatrix, researchSummary
- competitors, technologySuggestions, apiLandscape, complianceNotes, industryStandards, risks
- lowConfidenceFlags`;

function renderUser(vars: Record<string, unknown>): string {
  const knowledgeItems = (vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>;
  const domain = vars.domain ? String(vars.domain) : '';
  const answeredQuestions = (vars.answeredQuestions ?? []) as Array<{
    question: string;
    answer: string;
  }>;

  return `Project: ${vars.projectName}\n\n${knowledgeItems.map((i) =>
    `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`
  ).join('\n')}\n\n${domain ? `Domain: ${domain}` : ''}\n\n${answeredQuestions.length > 0
    ? `Answered Questions:\n${answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}`
    : ''}`;
}

export const researchTemplate = definePrompt({
  key: 'agent:research',
  kind: 'agent',
  description: 'Research agent — domain feasibility, competitors, tech suggestions.',
  system: ['@block:shared.output-contract', RESEARCH_OUTLINE],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    domain: { type: 'string' },
    knowledgeItems: { type: 'array' },
    answeredQuestions: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

### Tab: Business Analyst Agent (`agent:business-analysis`) — TEMPLATE

**Source:** `apps/server/src/agents/business-analyst.service.ts`

**Migration note:** This agent references `BG-*` IDs from Discovery output. See `PROMPT_BUILDER.md` § "How to Extend".

```typescript
export const businessAnalysisTemplate = definePrompt({
  key: 'agent:business-analysis',
  kind: 'agent',
  description: 'Business Analyst — business process, stakeholders, goals.',
  system: ['@block:shared.output-contract', BUSINESS_ANALYSIS_OUTLINE],
  user: renderBusinessAnalysisUser,
  variables: {
    projectName: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
    answeredQuestions: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

**Key constraint:** Must reference `BG-*` IDs that exist in the supplied prior-agent context (Discovery output).

### Tab: Product Manager Agent (`agent:product-analysis`) — TEMPLATE

**Source:** `apps/server/src/agents/product-manager.service.ts`

```typescript
export const productAnalysisTemplate = definePrompt({
  key: 'agent:product-analysis',
  kind: 'agent',
  description: 'Product Manager — feature sets, user stories, success metrics.',
  system: ['@block:shared.output-contract', PRODUCT_ANALYSIS_OUTLINE],
  user: renderProductAnalysisUser,
  variables: {
    projectName: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
    answeredQuestions: { type: 'array' },
  },
  version: { major: 1, minor: 0 },
  resolveVars: (input) => input,
});
```

**Key constraint:** Business Analysis runs before Product Analysis (pipeline order lock P1-2). The PM schema references `BR-*` IDs from Business Analysis output.

### Migration Workflow

After creating each agent/document template:

1. Register in `template-registry.ts`:
```typescript
import { researchTemplate } from './templates/structured/research';
import { userStoriesTemplate } from './templates/documents/user-stories';

export const TEMPLATE_REGISTRY: Record<string, PromptTemplate> = {
  [discoveryTemplate.key]: discoveryTemplate,
  [frdTemplate.key]: frdTemplate,
  [researchTemplate.key]: researchTemplate,        // New
  [userStoriesTemplate.key]: userStoriesTemplate,  // New
  // ... add others
};
```

2. Update agent service to use the builder:
```typescript
// In research.service.ts
import { buildAgentMessages } from '../prompts/prompt-builder.service';

// Replace:
//   const messages = [SYSTEM_PROMPT, USER_PROMPT]; 
// With:
const messages: LLMMessage[] = buildAgentMessages('research', ctx);
```

3. Update document service:
```typescript
// In user-stories.service.ts
import { buildDocumentMessages } from '../prompts/prompt-builder.service';

// Replace:
//   const messages = buildDocMessages(ENTERPRISE_GLOBAL, USER_STORIES_PROMPT, items);
// With:
const messages: LLMMessage[] = buildDocumentMessages('user-stories', ctx);
```

4. Run tests:
```bash
cd apps/server && pnpm run test:unit prompt-builder
pnpm run typecheck
