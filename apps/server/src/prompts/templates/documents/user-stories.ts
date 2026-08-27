import { definePrompt } from '../../template.types';
import {
  USER_STORIES_DOCUMENT_PROMPT,
} from '../../../agents/document.prompts';

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .filter((i) => ['FEATURE', 'FUNCTIONAL_REQUIREMENT', 'USER_STORY', 'PERSONA', 'MODULE'].includes(i.type))
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Product Backlog per your system instructions, using the knowledge items below as the primary source context. Ensure every functional requirement has one or more implementation-ready user stories, and identify any missing stories automatically. Expand each story with substantial narrative detail, user value, detailed acceptance criteria, edge cases, validations, dependencies, and operational considerations so the backlog is rich enough for sprint planning and QA.`;
}

export const userStoriesTemplate = definePrompt({
  key: 'document:user-stories',
  kind: 'document',
  description: 'User Stories & Acceptance Criteria document generator.',
  system: ['@block:enterprise.global', USER_STORIES_DOCUMENT_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
