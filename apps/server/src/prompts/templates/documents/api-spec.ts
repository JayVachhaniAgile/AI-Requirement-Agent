import { definePrompt } from '../../template.types';
import { API_SPEC_DOCUMENT_PROMPT } from '../../../agents/document.prompts';

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    title: string;
    description?: string | null;
  }>)
    .filter((i) =>
      [
        'FUNCTIONAL_REQUIREMENT',
        'API_CONTRACT',
        'SYSTEM_ARCHITECTURE',
        'FEATURE',
        'MODULE',
        'DATA_ENTITY',
        'BUSINESS_REQUIREMENT',
        'SECURITY_REQUIREMENT',
        'PERFORMANCE_REQUIREMENT',
      ].includes(i.type),
    )
    .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete OpenAPI 3.0 API Specification per your system instructions, using the knowledge items below as the primary source context. Every functional requirement should have corresponding APIs, with full request/response schemas, status codes, error handling, authentication, pagination, filtering, sorting, versioning, idempotency, and realistic examples. Ensure the spec is materially detailed and implementation-ready.`;
}

export const apiSpecTemplate = definePrompt({
  key: 'document:api-spec',
  kind: 'document',
  description: 'OpenAPI 3.0 API Specification document generator.',
  system: ['@block:enterprise.global', API_SPEC_DOCUMENT_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
