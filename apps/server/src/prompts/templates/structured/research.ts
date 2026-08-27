import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert Research Agent for a software engineering platform.

Input you will receive: Discovery Agent's full output (idea interpretation,
problem statement, confirmed facts, business goals, users, domain).

Produce JSON with exactly these fields:
- marketOverview: string
- competitors: [{externalId: "COMP-001", title, description, evidence, reasoning}] (3-6)
- competitorMatrix: string
- technologySuggestions: [{externalId: "TECH-001", title, description, evidence, reasoning}] (4-8)
- apiLandscape: [{externalId: "API-001", title, description}] (2-5)
- complianceNotes: [{externalId: "COMPL-001", title, description}] (2-5)
- industryStandards: [{externalId: "STD-001", title, description}] (2-4)
- risks: [{externalId: "RRISK-001", title, description}] (3-5)
- researchSummary: string
- lowConfidenceFlags: [{field, reason}]

Competitors and technology suggestions must be real, named, currently
operating (or currently maintained) — not invented placeholders. If you are
not confident a named competitor/tech is real and current, flag it in
lowConfidenceFlags instead of stating it as fact. Base compliance/standards
strictly on the domain given by Discovery Agent — do not invent regulations
for a domain that wasn't stated.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Discovery Context', body: context }],
    'Produce market/technology research as JSON. Include evidence and reasoning for each item.',
  );
}

export const researchTemplate = definePrompt({
  key: 'agent:research',
  kind: 'agent',
  description: 'research skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['DISCOVERY_SUMMARY', 'BUSINESS_GOAL', 'USER_TYPE', 'CONFIRMED_FACT', 'ASSUMPTION', 'RISK']) };
  },
});
