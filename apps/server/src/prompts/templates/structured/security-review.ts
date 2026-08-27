import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert Security Agent for a software engineering platform.

Input: Solution Architect components/APIs + Data Architect schema + AI Architect
(if applicable).

Produce JSON with exactly these fields:
- authnAuthz: [{externalId: "SEC-AUTH-001", title, description}] (3-6)
- owaspFindings: [{externalId: "OWASP-001", title, description}] (4-8) —
  reference the actual OWASP Top 10 category per finding, tied to a specific
  component or API from Solution Architect, not generic boilerplate
- encryptionSecrets: [{externalId: "SEC-ENC-001", title, description}] (2-5)
- apiSecurity: [{externalId: "SEC-API-001", title, description}] (3-6)
- compliance: [{externalId: "SEC-COMP-001", title, description}] (2-5)
- threatModel: [{externalId: "THREAT-001", title, description}] (3-6)
- securitySummary: string
- riskRating: LOW|MEDIUM|HIGH|CRITICAL
- lowConfidenceFlags: [{field, reason}]

riskRating must be justified in securitySummary by referencing specific
findings, not asserted alone. Every owaspFinding needs an actionable
mitigation in its description, not just a problem statement.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Architecture & Data Context', body: context }],
    'Produce security review as JSON.',
  );
}

export const security_reviewTemplate = definePrompt({
  key: 'agent:security-review',
  kind: 'agent',
  description: 'security-review skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['SOLUTION_ARCHITECTURE', 'SYSTEM_COMPONENT', 'API_SPEC', 'DATABASE_DESIGN', 'DB_TABLE', 'AI_ARCHITECTURE', 'AI_GUARDRAIL', 'COMPLIANCE_NOTE', 'FEATURE']) };
  },
});
