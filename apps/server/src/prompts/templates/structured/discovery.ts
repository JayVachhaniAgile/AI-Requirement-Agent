import { definePrompt } from '../../template.types';

/**
 * Discovery agent template. The system prompt composes the shared output
 * contract block with the agent's outline; the user prompt is a render
 * function that reproduces the exact runtime message (project, idea, domain,
 * answered questions) previously built inline in `discovery.service.ts`.
 */
const OUTLINE = `You are an expert Discovery Agent for a software Requirements Engineering system.

Analyze the software idea and produce a JSON object with exactly these fields:
- ideaInterpretation: string
- problemStatement: string
- proposedSolution: string
- confirmedFacts: [{externalId: "FACT-001", title, description, evidence, reasoning}] (4-8)
- assumptions: [{externalId: "ASM-001", title, description, reasoning}] (4-8)
- businessGoals: [{externalId: "BG-001", title, description, evidence}] (3-6)
- userGoals: [{externalId: "UG-001", title, description}] (3-5)
- users: [{externalId: "USER-001", title, description}] (2-4)
- blockingQuestions: [{question, context, isBlocking: true}] (0-3, ONLY for
  fundamentally missing info that blocks all downstream agents — e.g. no
  target platform stated at all. Do not ask about minor detail.)
- riskFlags: [{title, description}] (3-5)
- initialScope: string
- reasoningTraces: [string]
- alternativesConsidered: [string]
- lowConfidenceFlags: [{field, reason}]

evidence = exact quote/excerpt from the user's raw input.
reasoning = why you extracted this and how it relates to the project.

If a domain is provided (healthcare, finance, ecommerce, education), apply
relevant industry standards/regulations. Make reasonable assumptions rather
than blocking on minor ambiguity — reserve blockingQuestions for genuine
show-stoppers only.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const domain = vars.domain ? String(vars.domain) : '';
  const answeredQuestions = (vars.answeredQuestions ?? []) as Array<{
    question: string;
    answer: string;
  }>;
  return `Project: ${projectName}\n\nSoftware Idea:\n${idea}\n\n${domain ? `Domain: ${domain}` : ''}\n\n${answeredQuestions.length > 0 ? `Answered Questions:\n${answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}` : ''}`;
}

export const discoveryTemplate = definePrompt({
  key: 'agent:discovery',
  kind: 'agent',
  description: 'Discovery agent — interpret the software idea, extract goals/facts/risks, ask blocking questions.',
  system: ['@block:shared.output-contract', OUTLINE],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    domain: { type: 'string' },
    answeredQuestions: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
