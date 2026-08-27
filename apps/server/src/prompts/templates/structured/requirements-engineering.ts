import { definePrompt } from '../../template.types';

const OUTLINE = `You are an expert Requirements Engineer for a software Requirements Engineering system.

Input: Product Manager features + Business Analyst BRs.

Produce JSON with:
- functionalRequirements: (10-20, or fewer if features list is small — see
  contract's no-padding rule) [{
    externalId: "FR-001", title, module, actor, description,
    priority: MUST_HAVE|SHOULD_HAVE|COULD_HAVE,
    relatedBR, relatedFeature,
    acceptanceCriteria: [{id: "AC-001-01", given, when, then}] (min 2),
    validationRules: string[],
    errorConditions: string[],
    evidence, reasoning
  }]
- userStories: [{externalId: "US-001", title, asA, iWant, soThat, relatedFR, evidence, reasoning}]
- lowConfidenceFlags: [{field, reason}]

relatedBR MUST match a real BR-xxx from Business Analyst output when such IDs
exist in the context. relatedFeature MUST match a real FEAT-xxx from Product
Manager output when such IDs exist in the context. If a feature has no
FEAT-xxx ID, still produce its FR(s) using the feature title/description as the
trace source, leave relatedFeature empty, and add a lowConfidenceFlags entry —
never return an empty functionalRequirements array because IDs are missing.
If the Features list is empty, generate FRs from the Idea, Modules, and
Business Requirements instead — an empty functionalRequirements array is
never acceptable regardless of the input. Produce at least 1 FR.
FR count should equal roughly 1-2 FRs per feature from Product Manager, not
a flat arbitrary range — if PM produced 8 features, expect ~10-14 FRs, not 20.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const modules = String(vars.modules ?? '');
  const features = String(vars.features ?? '');
  const brs = String(vars.brs ?? '');
  return `Project: ${projectName}\n\nIdea: ${idea}\n\nModules:\n${modules}\n\nFeatures:\n${features}\n\nBusiness Requirements:\n${brs}\n\nGenerate comprehensive FRs and user stories as JSON with evidence and reasoning for each item.`;
}
export const requirements_engineeringTemplate = definePrompt({
  key: 'agent:requirements-engineering',
  kind: 'agent',
  description: 'requirements-engineering skill.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  resolveVars: (input) => {
    const projectName = input.projectName as string;
    const idea = input.idea as string;
    const knowledgeItems = (input.knowledgeItems ?? []) as Array<{ type: string; externalId?: string | null; title: string; description?: string | null }>;
    const modules = knowledgeItems.filter((i) => i.type === 'MODULE').map((i) => `${i.externalId ?? ''}: ${i.title}`).join('\n');
    const features = knowledgeItems.filter((i) => i.type === 'FEATURE').map((i) => `${i.externalId ?? ''}: ${i.title} — ${i.description ?? ''}`).join('\n');
    const brs = knowledgeItems.filter((i) => i.type === 'BUSINESS_REQUIREMENT').map((i) => `${i.externalId ?? ''}: ${i.title}`).join('\n');
    return { projectName, idea, modules, features, brs };
  },
});
