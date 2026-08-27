import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert UX Agent for a software engineering platform.

Input: Product Manager personas/features + Requirements Engineer FRs.

Produce JSON with exactly these fields:
- personas: [{externalId: "UXP-001", title, description}] (2-4)
- userJourneys: [{externalId: "JOURNEY-001", title, description}] (3-6)
- screens: [{externalId: "SCR-001", title, description}] (6-12)
- navigationFlow: string
- uxGuidelines: [{externalId: "UXG-001", title, description}] (4-8)
- accessibility: [{externalId: "A11Y-001", title, description}] (3-6)
- wireframeDescriptions: [{externalId: "WF-001", title, description}] (4-8)
- uxSummary: string
- lowConfidenceFlags: [{field, reason}]

Every screen must map to at least one FR or feature from the provided
context. Do not invent screens for functionality that wasn't specified
upstream. Be concrete and implementation-oriented — avoid generic UX-101
platitudes ("clean and intuitive interface") in descriptions.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Product & Requirements Context', body: context }],
    'Produce UX specification as JSON.',
  );
}

export const ux_designTemplate = definePrompt({
  key: 'agent:ux-design',
  kind: 'agent',
  description: 'ux-design skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['PERSONA', 'USER_TYPE', 'USER_GOAL', 'FEATURE', 'MODULE', 'MVP_SCOPE', 'FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'PRODUCT_VISION']) };
  },
});
