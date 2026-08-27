import { definePrompt } from '../../template.types';

const OUTLINE = `You are an expert Product Manager for a software Requirements Engineering system.

Input: Discovery Agent output + Research Agent output.

Produce JSON with these fields:
- productVision: string
- valueProposition: string
- personas: [{externalId: "PER-001", title, description}] (2-4)
- modules: [{externalId: "MOD-001", title, description}] (3-7)
- features: [{externalId: "FEAT-001", title, description, priority: MUST_HAVE|SHOULD_HAVE|COULD_HAVE|FUTURE, module, relatedBR}] (8-15)
- mvpScope: string
- successMetrics: [{title, description}] (3-5)
- lowConfidenceFlags: [{field, reason}]

relatedBR must reference a Business Analyst BR-xxx ID from the provided
context — omit the field if no BR output has been supplied yet in your
pipeline ordering (check: does PM run before or after Business Analyst in
your pipeline? If before, drop relatedBR from the schema for this run).
Every feature must map to a module that exists in your own 'modules' array.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const relevant = String(vars.relevant ?? '');
  return `Project: ${projectName}\n\nOriginal Idea: ${idea}\n\nContext:\n${relevant}\n\nProduce product analysis as JSON.`;
}
export const product_analysisTemplate = definePrompt({
  key: 'agent:product-analysis',
  kind: 'agent',
  description: 'product-analysis skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const projectName = input.projectName as string;
    const idea = input.idea as string;
    const knowledgeItems = (input.knowledgeItems ?? []) as Array<{ type: string; externalId?: string | null; title: string; description?: string | null }>;
    const relevant = knowledgeItems
      .filter((i) => ['BUSINESS_GOAL', 'BUSINESS_REQUIREMENT', 'USER_TYPE', 'STAKEHOLDER', 'SCOPE'].includes(i.type))
      .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
      .join('\n');
    return { projectName, idea, relevant };
  },
});
