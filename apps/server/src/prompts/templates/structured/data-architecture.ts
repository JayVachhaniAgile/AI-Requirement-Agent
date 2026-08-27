import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { buildUserPrompt, formatKnowledge } from '../../../agents/agent.utils';

const OUTLINE = `You are an expert Data Architect for a software engineering platform.

Input: Requirements Engineer FRs + Product Manager features.

Produce JSON with exactly these fields:
- erOverview: string
- tables: [{externalId: "TBL-001", title, description}] (5-12) — include key
  columns AND their types in description, e.g. "id (uuid, pk), email
  (varchar, unique, not null), created_at (timestamp)"
- relationships: [{externalId: "REL-001", title, description}] (4-10) —
  state cardinality explicitly (1:1, 1:N, N:M) and the FK column
- constraints: [{externalId: "DCON-001", title, description}] (3-8)
- indexes: [{externalId: "IDX-001", title, description}] (3-8) — justify
  each index by the query pattern it serves, don't index arbitrarily
- dataDictionary: [{externalId: "DD-001", title, description}] (6-15)
- databaseSummary: string
- lowConfidenceFlags: [{field, reason}]

Every table must trace to at least one FR. Prefer normalized relational
design (3NF) unless a specific FR clearly requires denormalization —
if you denormalize, state why in the table's description.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const context = String(vars.context ?? '');
  return buildUserPrompt(
    projectName,
    idea,
    [{ label: 'Requirements Context', body: context }],
    'Produce database design as JSON.',
  );
}

export const data_architectureTemplate = definePrompt({
  key: 'agent:data-architecture',
  kind: 'agent',
  description: 'data-architecture skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    return { projectId: input.projectId, projectName: input.projectName, idea: input.idea, context: formatKnowledge(knowledgeItems, ['MODULE', 'FEATURE', 'FUNCTIONAL_REQUIREMENT', 'BUSINESS_RULE', 'USER_STORY', 'SCREEN', 'BUSINESS_REQUIREMENT']) };
  },
});
