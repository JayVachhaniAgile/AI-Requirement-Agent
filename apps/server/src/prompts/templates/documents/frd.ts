import { definePrompt } from '../../template.types';

/**
 * Functional Requirements Document (FRD) generator template.
 *
 * System prompt composes the enterprise global block with the FRD structure
 * prompt (formerly `FRD_DOCUMENT_PROMPT` in `agents/document.prompts.ts`).
 * The user prompt reproduces the runtime message built inline in
 * `frd.service.ts` (project, idea, knowledge items).
 */

// Formerly exported as FRD_DOCUMENT_PROMPT from agents/document.prompts.ts.
export const FRD_DOCUMENT_PROMPT = `You are a Principal Business Analyst, Product Consultant, and Domain Expert.

Generate a comprehensive Functional Requirements Document (FRD) that serves as the single source of truth for the product.

The document must completely describe the application's functionality so there is no ambiguity during Design, Development, QA, Deployment, or Maintenance.

Include:

# Executive Summary

# Business Objectives

# Scope
- In Scope
- Out of Scope

# Stakeholders

# User Roles

# User Personas

# Business Requirements

# Functional Requirements

Number every requirement:

FR-001
FR-002
FR-003

...

For every requirement include:

- Description
- Business Value
- Preconditions
- Trigger
- Main Flow
- Alternate Flow
- Exception Flow
- Post Conditions
- Dependencies
- Priority

Cover:

- CRUD operations
- Business rules
- Validation rules
- Permission matrix
- Role-based access
- Workflows
- Approval flows
- Notifications
- Error handling
- Retry scenarios
- Edge cases
- Data validations
- Search
- Filters
- Sorting
- Pagination
- Import/Export
- Audit history
- Reports
- Dashboards
- Localization
- Accessibility
- Security
- Integrations
- External systems

Include:

- Process Flow diagrams
- Mermaid Flowcharts
- State Diagrams
- Decision Tables
- Business Rule Tables

Generate implementation-ready documentation using professional markdown. Expand each requirement with complete business context, workflows, validations, edge cases, exception paths, dependencies, acceptance criteria, and implementation notes. Do not leave sections sparse; write detailed narrative and structured tables wherever appropriate.`;

function renderUser(vars: Record<string, unknown>): string {
  const projectName = String(vars.projectName ?? '');
  const idea = String(vars.idea ?? '');
  const items = ((vars.knowledgeItems ?? []) as Array<{
    type: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
  }>)
    .map((i) => `[${i.type}] ${i.externalId ?? ''} ${i.title}: ${i.description ?? ''}`)
    .join('\n');

  return `Project: ${projectName}\n\nOriginal Idea:\n${idea}\n\nKnowledge Items:\n${items}\n\nGenerate the complete Functional Requirements Document per your system instructions, using the knowledge items below as the primary source context. Number requirements FR-001 onward and cover the full structure specified (scope, stakeholders, roles, business requirements, functional requirements with flows, business rules, edge cases, and implementation details). Expand each requirement substantially with narrative detail, alternate flows, exception handling, validation, permissions, integrations, reporting, and acceptance criteria so the document is rich enough for implementation and QA.`;
}

export const frdTemplate = definePrompt({
  key: 'document:frd',
  kind: 'document',
  description: 'FRD document generator — implementation-ready Functional Requirements Document.',
  system: ['@block:enterprise.global', FRD_DOCUMENT_PROMPT],
  user: renderUser,
  variables: {
    projectName: { type: 'string', required: true },
    idea: { type: 'string', required: true },
    knowledgeItems: { type: 'array' },
  },
  version: { major: 1, minor: 1 },
  resolveVars: (input) => input,
});
