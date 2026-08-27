# PROCESS_FIXES.md — System Fixes & Full Process Documentation

> Comprehensive record of all fixes applied to the Crystallize platform.

## 1. DagEngineModule — ContextEngineService Dependency Resolution

### Problem
```
Nest can't resolve dependencies of the DagAgentExecutorAdapter (... ContextEngineService at index [31])
```

ContextEngineModule was imported as a TypeScript symbol but not listed in the
@Module({ imports: [...] }) array. Without this entry, NestJS cannot resolve
the token in the DagEngineModule context.

### Fix
**File:** apps/server/src/dag-engine/dag-engine.module.ts

Added ContextEngineModule to the imports array (the import statement already
existed at line 10).

### Flow
1. DagAgentExecutorAdapter constructor declares 40 dependencies including
   ContextEngineService
2. DagAgentExecutorAdapter.buildContext() calls this.contextEngine.compile()
3. The module now has access via the imported ContextEngineModule (which
   exports ContextEngineService)

---

## 2. LLM Model Router — Provider-Aware Default Model

### Problem
With LLM_PROVIDER=ollama and OLLAMA_MODEL=llama3.1:latest, logs showed:
```
404 model 'gpt-4o' not found
```

### Root Cause
model-router.service.ts passed defaultModel: config.get("OPENAI_MODEL") which
is undefined when using Ollama. The resolveModelRoute function then fell back
to hardcoded DEFAULT_MODEL = "gpt-4o".

### Fix
**File:** apps/server/src/foundation/models/model-router.service.ts

Resolved provider-specific default model:

```ts
const defaultModel =
  provider === "ollama"
    ? (this.config.get<string>("OLLAMA_MODEL") ?? "llama3")
    : provider === "groq"
      ? (this.config.get<string>("GROQ_MODEL") ?? this.config.get<string>("OPENAI_MODEL"))
      : provider === "custom"
        ? (this.config.get<string>("CUSTOM_LLM_MODEL") ?? this.config.get<string>("OPENAI_MODEL"))
        : this.config.get<string>("OPENAI_MODEL");
```

### Provider Resolution Chain
| Provider | Env Var | Fallback |
|---|---|---|
| openai | OPENAI_MODEL | gpt-4o |
| groq | GROQ_MODEL | OPENAI_MODEL -> gpt-4o |
| ollama | OLLAMA_MODEL | llama3 |
| custom | CUSTOM_LM_MODEL | OPENAI_MODEL -> gpt-4o |

---

## 3. Discovery Checkpoint Card — Approval Window Not Showing

### Problem
When pipeline paused at Discovery checkpoint, approval card was not visible.

### Root Cause
DiscoveryCheckpointCard component existed but was never imported or rendered
in the project page [id].tsx.

### Fix
**File:** apps/client/src/pages/projects/[id].tsx

1. Added import: import { DiscoveryCheckpointCard } from "@/components/.../DiscoveryCheckpointCard"
2. Added conditional render before Tabs section

### Checkpoint Flow
1. Discovery agent completes -> run status becomes WAITING_APPROVAL
2. Project status mirrors stage status (DISCOVERING)
3. Card shows: editable interpretation fields, blocking questions, "Looks Right" button
4. Confirm -> POST /api/projects/:id/discovery-confirmation -> pipeline resumes

---

## 4. TreePipelineView — Agent Details Modal on Node Click

### Problem
Clicking agent nodes did not open AgentDetailsModal. State vars
(showAgentModal, agentModalKey) were declared but never set.

### Root Cause
- TreePipelineView had elementsSelectable={false} and no onNodeClick handler
- Project page never wired the click to the modal state

### Fix
**File:** TreePipelineView.tsx
- Added onAgentClick prop to TreePipelineViewProps
- Set elementsSelectable={true} on ReactFlow
- Added onNodeClick handler that checks node.type === "agent" and calls onAgentClick

**File:** projects/[id].tsx
- Wired onAgentClick to setAgentModalKey and setShowAgentModal(true)

### Modal Content
- Agent output/knowledge items (expandable)
- Execution details (model, tokens, retries)
- Regenerate button

---

## 5. ProjectAgentNetwork — Connector Curvature Fix

### Problem
One connector line appeared straight while others were curved.

### Root Cause
Quadratic Bezier with fixed perpendicular offset was too subtle for long
connectors.

### Fix
**File:** ProjectAgentNetwork.tsx
- Switched from quadratic Bezier (Q) to cubic Bezier (C)
- Two control points at 33% and 66% of path length, offset 60px perpendicular
- Added nodeStatuses prop for live status display

```tsx
const cp1x = pos.x + dx * 0.33 + nx * 60;
const cp1y = pos.y + dy * 0.33 + ny * 60;
const cp2x = pos.x + dx * 0.66 + nx * 60;
const cp2y = pos.y + dy * 0.66 + ny * 60;
```

### CSS
Styles in projectAgentNetwork.css handle dashed animation and hover/running states.

---

## 6. Environment Variables Reference

| Variable | Purpose | Default |
|---|---|---|
| LLM_PROVIDER | Provider: openai/groq/ollama/custom | openai |
| OPENAI_API_KEY | OpenAI API key | — |
| OPENAI_MODEL | OpenAI model | gpt-4o |
| GROQ_API_KEY | Groq API key | — |
| GROQ_MODEL | Groq model | llama-3.3-70b-versatile |
| OLLAMA_BASE_URL | Ollama base URL | http://localhost:11434/v1 |
| OLLAMA_MODEL | Ollama model | llama3 |
| CUSTOM_LLM_BASE_URL | Custom provider URL | — |
| CUSTOM_LLM_API_KEY | Custom provider API key | custom |
| CUSTOM_LLM_MODEL | Custom provider model | custom-model |
| LLM_MODEL_HIGH | Override for high-tier agents | provider default |
| LLM_MODEL_STANDARD | Override for standard-tier agents | provider default |
| LLM_MODEL_FAST | Override for fast-tier agents | provider default |
| LLM_TIMEOUT_MS | Per-request timeout (ms) | 120000 |
| SKIP_VALIDATION | Bypass validation/retry | false |

### Tier Mapping
- high tier: requirements-engineering, solution-architecture, validation, debate
- fast tier: research, estimation
- standard tier: discovery, business-analysis, product-analysis, ux-design,
  data-architecture, ai-architecture, security-review, qa-planning, gap-analysis

Full list: apps/server/src/llm/agent-model.config.ts
