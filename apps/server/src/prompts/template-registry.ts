/**
 * Template Registry — the single source of truth for all prompt templates.
 * Every agent/document template is registered here by key.
 */
import type { PromptTemplate, PromptVars } from './template.types';
import { discoveryTemplate } from './templates/structured/discovery';
import { researchTemplate } from './templates/structured/research';
import { business_analysisTemplate } from './templates/structured/business-analysis';
import { product_analysisTemplate } from './templates/structured/product-analysis';
import { requirements_engineeringTemplate } from './templates/structured/requirements-engineering';
import { ux_designTemplate } from './templates/structured/ux-design';
import { data_architectureTemplate } from './templates/structured/data-architecture';
import { ai_architectureTemplate } from './templates/structured/ai-architecture';
import { solution_architectureTemplate } from './templates/structured/solution-architecture';
import { security_reviewTemplate } from './templates/structured/security-review';
import { qa_planningTemplate } from './templates/structured/qa-planning';
import { estimationTemplate } from './templates/structured/estimation';
import { validationTemplate } from './templates/structured/validation';
import { debateTemplate } from './templates/structured/debate';
import { gap_analysisTemplate } from './templates/structured/gap-analysis';
import { frdTemplate } from './templates/documents/frd';
import { userStoriesTemplate } from './templates/documents/user-stories';
import { techArchTemplate } from './templates/documents/tech-arch';
import { dbDesignTemplate } from './templates/documents/db-design';
import { apiSpecTemplate } from './templates/documents/api-spec';
import { sowChunkTemplate, sowMergeTemplate, sowTemplate } from './templates/documents/sow';

export interface AgentContextLike {
  projectId: string;
  projectName: string;
  idea: string;
  knowledgeItems?: Array<{ externalId?: string | null; type: string; title: string; description?: string | null }>;
  answeredQuestions?: Array<{ question: string; answer: string }>;
  domain?: string;
  [key: string]: unknown;
}

export const TEMPLATE_REGISTRY: Record<string, PromptTemplate> = {
  [discoveryTemplate.key]: discoveryTemplate,
  [researchTemplate.key]: researchTemplate,
  [business_analysisTemplate.key]: business_analysisTemplate,
  [product_analysisTemplate.key]: product_analysisTemplate,
  [requirements_engineeringTemplate.key]: requirements_engineeringTemplate,
  [ux_designTemplate.key]: ux_designTemplate,
  [data_architectureTemplate.key]: data_architectureTemplate,
  [ai_architectureTemplate.key]: ai_architectureTemplate,
  [solution_architectureTemplate.key]: solution_architectureTemplate,
  [security_reviewTemplate.key]: security_reviewTemplate,
  [qa_planningTemplate.key]: qa_planningTemplate,
  [estimationTemplate.key]: estimationTemplate,
  [validationTemplate.key]: validationTemplate,
  [debateTemplate.key]: debateTemplate,
  [gap_analysisTemplate.key]: gap_analysisTemplate,
  [frdTemplate.key]: frdTemplate,
  [userStoriesTemplate.key]: userStoriesTemplate,
  [techArchTemplate.key]: techArchTemplate,
  [dbDesignTemplate.key]: dbDesignTemplate,
  [apiSpecTemplate.key]: apiSpecTemplate,
  [sowTemplate.key]: sowTemplate,
  [sowChunkTemplate.key]: sowChunkTemplate,
  [sowMergeTemplate.key]: sowMergeTemplate,
};

export function getTemplate(key: string): PromptTemplate {
  const template = TEMPLATE_REGISTRY[key];
  if (!template) {
    throw new Error(`Unknown prompt template: ${key}`);
  }
  return template;
}

export function listTemplates(): PromptTemplate[] {
  return Object.values(TEMPLATE_REGISTRY);
}

export function hasTemplate(key: string): boolean {
  return key in TEMPLATE_REGISTRY;
}

/** Resolve the var map for a template given a runtime input (AgentContext or raw vars). */
export function resolveVarsFor(template: PromptTemplate, input: PromptVars): PromptVars {
  return template.resolveVars ? template.resolveVars(input) : input;
}
