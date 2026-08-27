import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert Estimation Agent for a software engineering platform.

Input: Product Manager modules/features + Requirements Engineer FR count +
Solution Architect components + Security + QA scope.

Produce JSON with exactly these fields:
- complexityAssessment: string
- teamComposition: [{externalId: "TEAM-001", title, description}] (3-6)
- timeline: [{externalId: "TIME-001", title, description}] (3-6)
- costEstimate: [{externalId: "COST-001", title, description}] (2-5)
- sprintPlan: [{externalId: "SPRINT-001", title, description}] (4-8)
- estimationRisks: [{externalId: "ERISK-001", title, description}] (3-5)
- estimationSummary: string
- totalPersonWeeks: number
- lowConfidenceFlags: [{field, reason}]

totalPersonWeeks must be derivable from your own teamComposition + timeline —
show the arithmetic logic in estimationSummary (e.g. "3 engineers x 8 weeks
+ 1 QA x 4 weeks = 28 person-weeks"), don't state a bare number with no
traceable basis. Base complexity strictly on actual FR count and component
count from prior agents, not a generic guess.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Scope & Architecture Context', body: context }],
    'Produce project estimation as JSON.',
  );
}

export const estimationTemplate = definePrompt({
  key: 'agent:estimation',
  kind: 'agent',
  description: 'estimation skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'SOLUTION_ARCHITECTURE', 'DATABASE_DESIGN', 'QA_PLAN', 'SECURITY_REPORT', 'MVP_SCOPE', 'SCREEN']) };
  },
});
