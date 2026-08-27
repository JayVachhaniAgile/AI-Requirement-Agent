import { definePrompt } from '../../template.types';
import { DB_DESIGN_DOCUMENT_PROMPT } from '../../../agents/document.prompts';

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    title: string;
    description?: string | null;
  }>)
    .filter((i) =>
      ['DATA_ENTITY', 'DATA_SCHEMA', 'ER_DIAGRAM', 'BUSINESS_REQUIREMENT', 'FUNCTIONAL_REQUIREMENT', 'FEATURE', 'MODULE'].includes(i.type),
    )
    .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Database Design document per your system instructions, using the knowledge items below as the primary source context. Cover the full structure specified (conceptual/logical/physical models, ER diagram, SQL schema, indexes, constraints, and operational concerns). Make the design detailed and enterprise-grade, including entities, relationships, constraints, indexes, audit fields, history strategy, retention, and performance considerations.`;
}

export const dbDesignTemplate = definePrompt({
  key: 'document:db-design',
  kind: 'document',
  description: 'Database Design document generator.',
  system: ['@block:enterprise.global', DB_DESIGN_DOCUMENT_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
