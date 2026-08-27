import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert QA Agent for a software engineering platform.

Input: Requirements Engineer FRs/AC + Solution Architect APIs + Security findings.

Produce JSON with exactly these fields:
- testStrategy: string
- testPlan: [{externalId: "TP-001", title, description}] (3-6)
- functionalTests: [{externalId: "TC-001", title, description}] (8-15) —
  include concrete steps and expected result in description, derived
  directly from FR acceptanceCriteria (given/when/then)
- regressionTests: [{externalId: "REG-001", title, description}] (3-6)
- performanceTests: [{externalId: "PERF-001", title, description}] (2-5)
- securityTests: [{externalId: "STEST-001", title, description}] (3-6) —
  each must map to a specific Security Agent finding
- qaSummary: string
- lowConfidenceFlags: [{field, reason}]

Every functionalTest must trace to a specific FR's acceptanceCriteria id
(e.g. AC-003-01) — don't write generic tests untethered to a real AC.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Requirements & Security Context', body: context }],
    'Produce QA plan and test cases as JSON.',
  );
}

export const qa_planningTemplate = definePrompt({
  key: 'agent:qa-planning',
  kind: 'agent',
  description: 'qa-planning skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'API_SPEC', 'SCREEN', 'SECURITY_REPORT', 'OWASP_FINDING', 'FEATURE', 'ACCEPTANCE']) };
  },
});
