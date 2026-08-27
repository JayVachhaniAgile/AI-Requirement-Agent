# PROMPT_BUILDER.md — Prompt Builder Framework

> Centralized prompt generation system for all AI agents and document generators.
> Replaces scattered inline prompt definitions with a declarative, versioned template engine.

## Status

| Component | Status |
|---|---|
| Module scaffold (`src/prompts/`) | **done** |
| DSL (`template.types.ts`) | **done** |
| Prompt block registry (shared contracts) | **done** |
| Template registry | **done** |
| Prompt builder service (render, compose, assemble) | **done** |
| Prompt versioner service (auto content hash + semantic tags) | **done** |
| Migration (Discovery agent) | **done** |
| Migration (FRD document generator) | **done** |
| Prompt templates (Discovery + FRD) | **done** |
| Few-shot example (Discovery, opt-in) | **done** |
| Unit specs (builder + versioner) | **done** |
| Entity tables (`prompt_templates`, `prompt_versions`, `prompt_test_runs`) | **done** |
| Wiring in `AppModule` + test script | **done** |
| Remaining 12 agents + 5 document types migrated | **not started** |

## Architecture

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

### Components

| Component | Purpose |
|---|---|
| `PromptTemplateRegistry` (`template-registry.ts`) | Loads, validates, and indexes every template by key (`agent:discovery`, `document:frd`). |
| `PromptBuilderService` (`prompt-builder.service.ts`) | Pure functions: `buildMessages`, `buildAgentMessages`, `buildDocumentMessages`, `previewMessages`. Renders `{{var}}`, `@block:` references, few-shot examples. No Nest DI — fully unit-testable. |
| `PromptVersionerService` (`prompt-versioner.service.ts`) | Deterministic content-hash version `v<MAJOR>.<MINOR>-<hash8>` per template; exposes `schemaVersion` for structured agents (P2-4). |
| `PromptsService` / `PromptsController` | Debug/introspection REST layer + optional DB snapshotting. |
| Entities | `prompt_templates`, `prompt_versions`, `prompt_test_runs`. |

## DSL (`template.types.ts`)

```ts
export interface PromptTemplate {
  key: string;                    // 'agent:<agentKey>' | 'document:<docType>'
  kind: 'agent' | 'document';
  description?: string;
  system: PromptPart | PromptPart[];      // strings (+ {{var}} + @block:) or render fns
  user?: PromptPart | PromptPart[];       // optional user prompt
  fewShot?: FewShotExample[];             // inserted between system and final user
  variables?: Record<string, PromptVariableSpec>; // declared contract
  version?: { major?: number; minor?: number };   // manual tag; patch = content hash
  resolveVars?: (input: PromptVars) => PromptVars;
}
```

## Prompt Blocks

Shared fragments moved out of `agents/*`:

| Block | Former location | Now |
|---|---|---|
| `shared.output-contract` | `agents/agent.prompts.ts` (`SHARED_OUTPUT_CONTRACT`) | `prompts/blocks/shared-output-contract.ts` |
| `enterprise.global` | `agents/document.prompts.ts` (`ENTERPRISE_GLOBAL_INSTRUCTION`) | `prompts/blocks/enterprise-global.ts` |

`agents/agent.prompts.ts` and `agents/document.prompts.ts` still re-export these for backward compatibility.

## Migration Proof Path

### Discovery agent (`agents/discovery.service.ts`)

Before: inline `SYSTEM` const + hand-built `userMsg` + manual messages array.
After: `messages: buildAgentMessages('discovery', ctx)` — identical output, covered by `prompt-builder.spec.ts`.

### FRD document generator (`agents/frd.service.ts`)

Before: inline `ENTERPRISE_GLOBAL_INSTRUCTION` + `FRD_DOCUMENT_PROMPT` + manual `prompt` string.
After: `messages: buildDocumentMessages('frd', ctx)` — identical output, covered by spec.

`FRD_DOCUMENT_PROMPT` now lives in `prompts/templates/documents/frd.ts` (single source of truth).

## APIs

### Runtime (used by agents)

```ts
buildAgentMessages('discovery', ctx)      // => LLMMessage[]
buildDocumentMessages('frd', ctx)         // => LLMMessage[]
```

### Debug / introspection (`/api/prompts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/prompts` | List templates + computed versions |
| `GET` | `/prompts/:key` | Full template source + version |
| `POST` | `/prompts/preview` | Render with sample vars (`{key, vars}`) — no LLM call |
| `POST` | `/prompts/snapshot` | Persist templates into DB (idempotent) |

## Entity Schema (database)

- `prompt_templates`: `id`, `prompt_key` (unique), `kind`, `content`, `content_hash`, `variables_json`, `metadata`, timestamps.
- `prompt_versions`: `id`, `prompt_key`, `version`, `content_hash`, `schema_version`, `diff`, `created_by`, `created_at`.
- `prompt_test_runs`: `id`, `prompt_key`, `version`, `sample_key`, `result`, `assertions_json`, `created_at`.

`synchronize: true` creates these in dev. `POST /prompts/snapshot` upserts current templates + new version rows when the content hash changes.

## Unit Specs

- `prompt-builder.spec.ts` — interpolation, block resolution, multi-part composition, few-shot insertion, Discovery/FRD snapshot rendering.
- `prompt-versioner.spec.ts` — content-hash determinism, `v<major>.<minor>-<hash8>` format, hash changes on prompt edits.

Both run via `pnpm run test:unit` and standalone via `node --test`.

## Folder Structure

```
apps/server/src/prompts/
|-- blocks/
|   |-- enterprise-global.ts
|   |-- index.ts                     # PROMPT_BLOCKS registry
|   `-- shared-output-contract.ts
|-- templates/
|   |-- documents/frd.ts             # FRD doc generator template
|   |-- examples/discovery.example.ts
|   `-- structured/discovery.ts      # Discovery agent template
|-- prompt-builder.service.ts        # pure render/compose/assemble
|-- prompt-versioner.service.ts      # content-hash + schema version
|-- prompts.controller.ts            # /api/prompts debug endpoints
|-- prompts.module.ts
|-- prompts.service.ts               # REST layer + snapshotting
|-- template-registry.ts             # getTemplate / listTemplates
|-- template.types.ts                # DSL types + definePrompt()
|-- prompt-builder.spec.ts
`-- prompt-versioner.spec.ts
```

## How to Extend

1. Add `src/prompts/templates/structured/<agent-key>.ts` or `documents/<doc-type>.ts` with `definePrompt(...)`.
2. Register it in `template-registry.ts`.
3. In the agent service, replace inline message building with `buildAgentMessages(...)` / `buildDocumentMessages(...)`.
4. Bump `version.minor` when the prompt text changes; the patch hash auto-changes.
5. Run `pnpm run test:unit` and `pnpm run typecheck` before merging.

## Benefits

1. Single source of truth — no copy-pasted `SHARED_OUTPUT_CONTRACT` across 24+ agents.
2. Auditable versions — content-hash + semantic tag per prompt (P2-4).
3. Testable — pure functions, snapshot tests for rendered prompts.
4. Declarative context injection — `resolveVars` maps `AgentContext` → template vars.
5. Non-breaking migration — identical rendered output, covered by specs.
6. Extensible — new agents/docs are just new template files.
7. Multi-model ready — templates are model-agnostic; `model-compat.ts` decides the structured-output mechanism, and the builder injects the schema hint only for prompt-constrained modes.

## Future Work

- Migrate remaining 12 structured agents + 5 document generators to templates.
- Wire `prompt_test_runs` recording into the golden-dataset eval (`eval/run-golden-eval.ts`).
- Add snapshot-diff detection: when `content_hash` changes, flag affected `run_logs` for eval review.
- Auto-attach few-shot examples from `templates/examples/` (currently opt-in to preserve exact behavior).
