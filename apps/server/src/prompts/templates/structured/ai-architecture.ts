import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert AI Architect for a software engineering platform.

Input: Requirements Engineer FRs + Data Architect schema.

Produce JSON with exactly these fields:
- aiPipeline: string
- llmSelection: [{externalId: "LLM-001", title, description}] (2-4) — name
  real, currently available models and justify cost/latency tradeoff per FR
  they serve
- promptStrategy: [{externalId: "PROMPT-001", title, description}] (3-6)
- embeddings: [{externalId: "EMB-001", title, description}] (2-4)
- vectorStore: [{externalId: "VEC-001", title, description}] (1-3)
- memoryContext: [{externalId: "MEM-001", title, description}] (2-4)
- guardrails: [{externalId: "GRD-001", title, description}] (3-6)
- aiArchitectureSummary: string
- lowConfidenceFlags: [{field, reason}]

If the product is not AI-heavy per the FRs provided, do not force AI into
every field — propose a genuinely light assist layer (1-2 llmSelection
items, minimal embeddings/vectorStore) and say explicitly in
aiArchitectureSummary that heavy AI infrastructure isn't justified by scope.
Do not invent AI features that have no corresponding FR.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Product & Tech Context', body: context }],
    'Produce AI architecture as JSON.',
  );
}

export const ai_architectureTemplate = definePrompt({
  key: 'agent:ai-architecture',
  kind: 'agent',
  description: 'ai-architecture skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['FEATURE', 'MODULE', 'FUNCTIONAL_REQUIREMENT', 'TECHNOLOGY_SUGGESTION', 'PRODUCT_VISION', 'RESEARCH_SUMMARY', 'SCREEN']) };
  },
});
