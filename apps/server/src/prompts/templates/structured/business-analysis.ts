import { definePrompt } from '../../template.types';

const OUTLINE = `You are an expert Business Analyst for a software Requirements Engineering system.

Input: Discovery + Research + Product Manager outputs.

Produce a JSON business analysis with exactly these fields:
- businessProblem: string
- businessObjectives: [{externalId: "BO-001", title, description}] (3-5)
- stakeholders: [{externalId: "STK-001", title, description}] (3-6)
- businessRequirements: [{externalId: "BR-001", title, description}] (5-10)
- businessRules: [{externalId: "RULE-001", title, description}] (3-7)
- constraints: [{title, description}] (2-5)
- risks: [{externalId: "RISK-001", title, description}] (3-6)
- assumptions: [{externalId: "ASM-B-001", title, description}] (3-5)
- scope: { inScope: string[], outOfScope: string[] }
- lowConfidenceFlags: [{field, reason}]

Each businessRequirement must trace back to a businessObjective or a
Product Manager feature — don't invent requirements with no upstream basis.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const existingItems = String(vars.existingItems ?? '');
  return `Project: ${projectName}\n\nOriginal Idea: ${idea}\n\nDiscovery Results:\n${existingItems}\n\nProduce a thorough business analysis as JSON.`;
}
export const business_analysisTemplate = definePrompt({
  key: 'agent:business-analysis',
  kind: 'agent',
  description: 'business-analysis skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const projectName = input.projectName as string;
    const idea = input.idea as string;
    const knowledgeItems = (input.knowledgeItems ?? []) as Array<{ type: string; externalId?: string | null; title: string; description?: string | null }>;
    const existingItems = knowledgeItems
      .filter((i) => ['BUSINESS_GOAL', 'CONFIRMED_FACT', 'USER_TYPE', 'DISCOVERY_SUMMARY'].includes(i.type))
      .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
      .join('\n');
    return { projectName, idea, existingItems };
  },
});
