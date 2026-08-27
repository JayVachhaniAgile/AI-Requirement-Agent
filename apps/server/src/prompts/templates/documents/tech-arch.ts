import { definePrompt } from '../../template.types';
import { HLD_DOCUMENT_PROMPT } from '../../../agents/document.prompts';

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
        'SYSTEM_ARCHITECTURE',
        'DATA_ARCHITECTURE',
        'AI_ARCHITECTURE',
        'SOLUTION_ARCHITECTURE',
        'TECH_STACK',
        'MODULE',
        'FUNCTIONAL_REQUIREMENT',
        'SECURITY_REQUIREMENT',
        'PERFORMANCE_REQUIREMENT',
        'API_CONTRACT',
        'DATA_ENTITY',
      ].includes(i.type),
    )
    .map((i) => `[${i.type}] ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete High-Level Design document per your system instructions, using the knowledge items below as the primary source context. Cover the full structure specified (architecture, technology stack, components, data flow, deployment, security, scalability, observability, and operations) with Mermaid diagrams where applicable. Make the content substantially detailed and implementation-oriented, including component responsibilities, integrations, failure modes, operational concerns, and engineering tradeoffs.`;
}

export const techArchTemplate = definePrompt({
  key: 'document:tech-arch',
  kind: 'document',
  description: 'Technical Architecture (HLD) document generator.',
  system: ['@block:enterprise.global', HLD_DOCUMENT_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
