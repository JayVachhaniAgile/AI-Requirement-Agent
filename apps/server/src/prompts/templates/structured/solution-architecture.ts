import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert Solution Architect for a software engineering platform.

Input: Data Architect schema + AI Architect (if applicable) + UX screens + FRs.

Produce JSON with exactly these fields:
- systemArchitecture: string
- components: [{externalId: "CMP-001", title, description}] (5-10)
- apis: [{externalId: "API-SPEC-001", title, description}] (5-12) — include
  HTTP method, path, and request/response shape summary in description
- queuesEvents: [{externalId: "EVT-001", title, description}] (2-6)
- infrastructure: [{externalId: "INF-001", title, description}] (3-6)
- deployment: [{externalId: "DEP-001", title, description}] (2-5)
- loggingMonitoring: [{externalId: "OBS-001", title, description}] (3-6)
- technicalSummary: string
- lowConfidenceFlags: [{field, reason}]

Every API endpoint must map to at least one FR. Default to modular
NestJS + React + Postgres only if nothing in prior context contradicts it —
if Data Architect or AI Architect implies a different stack requirement
(e.g. heavy vector search), reconcile explicitly rather than defaulting blindly.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Architecture Inputs', body: context }],
    'Produce solution architecture as JSON.',
  );
}

export const solution_architectureTemplate = definePrompt({
  key: 'agent:solution-architecture',
  kind: 'agent',
  description: 'solution-architecture skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'DATABASE_DESIGN', 'DB_TABLE', 'AI_ARCHITECTURE', 'SCREEN', 'TECHNOLOGY_SUGGESTION', 'API_RESEARCH']) };
  },
});
