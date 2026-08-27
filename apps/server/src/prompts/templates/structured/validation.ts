import { definePrompt } from '../../template.types';
import type { KnowledgeItemSummary } from '../../../agents/types';
import { compactKnowledgeSummary, formatConflicts } from '../../../agents/agent.utils';

const OUTLINE = `You are the Critic and Validation Agent. Find real problems across the full documentation pipeline.

Produce JSON with:
- validationResult: "PASS" | "CONDITIONAL_PASS" | "FAIL"
- scores: object with numeric 0-10 scores for: businessCompleteness, productDefinition, requirementCompleteness, uxCompleteness, architectureQuality, securityPosture, qaCoverage, estimationRealism, consistency, testability, traceability, mvpClarity
- issues: [{externalId: "VAL-001", severity: CRITICAL|HIGH|MEDIUM|LOW, category, sourceAgent, affectedIds: [], problem, evidence, impact, recommendedCorrection, responsibleAgent, requiresHumanDecision: false}] (3-8)
- summary: string (2-4 sentences)
- lowConfidenceFlags: [{field, reason}]

Use the compact knowledge inventory. Prefer high-severity, actionable issues. Keep evidence short.

Categories: MISSING_REQUIREMENT, CONTRADICTION, UNTESTABLE, MISSING_ACCEPTANCE_CRITERIA, BROKEN_TRACEABILITY, SCOPE_CREEP, SECURITY_GAP, UX_GAP, ARCHITECTURE_ISSUE, DATABASE_ISSUE, ESTIMATION_RISK, UNREALISTIC_ASSUMPTION, DUPLICATE, OTHER`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '').slice(0, 800);
  const summary = String(vars.summary ?? '');
  const conflicts = String(vars.conflicts ?? '');
  return `Project: ${projectName}\n\nIdea: ${idea}\n\nCompact Knowledge:\n${summary}\n\n${conflicts}Produce validation report JSON.`;
}
export const validationTemplate = definePrompt({
  key: 'agent:validation',
  kind: 'agent',
  description: 'validation skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const projectName = input.projectName as string;
    const idea = input.idea as string;
    const knowledgeItems = (input.knowledgeItems ?? []) as KnowledgeItemSummary[];
    const conflicts = (input.conflicts ?? []) as Array<{ sourceId: string; sourceTitle: string; sourceDomain: string; targetId: string; targetTitle: string; targetDomain: string; relation: string; reason?: string | null }>;
    const summary = compactKnowledgeSummary(knowledgeItems, { maxChars: 9000, maxDesc: 80, maxPerType: 6 });
    return { projectName, idea, summary, conflicts: formatConflicts(conflicts) };
  },
});
