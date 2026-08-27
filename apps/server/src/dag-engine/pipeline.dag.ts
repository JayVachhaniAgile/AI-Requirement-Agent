/**
 * Crystallize pipeline expressed as a DAG.
 *
 * Nodes mirror the existing 23-stage pipeline (14 structured agents + 6 document generators + 1 build-prompt + gap analysis). Edges encode the real dependency contract (AGENT_DIGEST_CONFIG immediate-upstream relationships) so independent nodes can execute in parallel: notably all six document generators run concurrently after compilation.
 */
import type { WorkflowDagDefinition } from './types';

export const CRYSTALLIZE_PIPELINE_DAG: WorkflowDagDefinition = {
  key: 'crystallize-pipeline',
  name: 'Crystallize Requirements Pipeline',
  description:
    'End-to-end requirements engineering: discovery -> research -> analysis -> design -> architecture -> review -> validation -> documents -> build-prompt -> gap analysis. Discovery is a human-approval checkpoint.',
  nodes: [
    { key: 'discovery', label: 'Discovery', checkpoint: true },
    { key: 'research', label: 'Research' },
    { key: 'business-analysis', label: 'Business Analysis' },
    { key: 'product-analysis', label: 'Product Analysis' },
    { key: 'requirements-engineering', label: 'Requirements Engineering' },
    { key: 'ux-design', label: 'UX Design' },
    { key: 'data-architecture', label: 'Data Architecture' },
    { key: 'ai-architecture', label: 'AI Architecture' },
    { key: 'solution-architecture', label: 'Solution Architecture' },
    { key: 'security-review', label: 'Security Review' },
    { key: 'qa-planning', label: 'QA Planning' },
    { key: 'estimation', label: 'Estimation' },
    { key: 'validation', label: 'Validation' },
    { key: 'debate', label: 'Debate' },
    { key: 'compilation', label: 'Compilation' },
    { key: 'frd', label: 'FRD Generation' },
    { key: 'user-stories', label: 'User Stories Generation' },
    { key: 'tech-arch', label: 'Tech Architecture Generation' },
    { key: 'db-design', label: 'Database Design Generation' },
    { key: 'api-spec', label: 'API Spec Generation' },
    { key: 'sow', label: 'SOW Generation' },
    { key: 'build-prompt', label: 'Build Prompt Generation' },
    { key: 'gap-analysis', label: 'Gap Analysis' },
  ],
  edges: [
    // Discovery gates everything.
    { from: 'discovery', to: 'research' },
    { from: 'discovery', to: 'business-analysis' },
    // Research feeds business analysis and product analysis.
    { from: 'research', to: 'business-analysis' },
    { from: 'research', to: 'product-analysis' },
    { from: 'business-analysis', to: 'product-analysis' },
    { from: 'business-analysis', to: 'requirements-engineering' },
    { from: 'product-analysis', to: 'requirements-engineering' },
    { from: 'product-analysis', to: 'ux-design' },
    { from: 'requirements-engineering', to: 'ux-design' },
    { from: 'requirements-engineering', to: 'data-architecture' },
    { from: 'ux-design', to: 'data-architecture' },
    { from: 'ux-design', to: 'ai-architecture' },
    { from: 'data-architecture', to: 'ai-architecture' },
    { from: 'ux-design', to: 'solution-architecture' },
    { from: 'data-architecture', to: 'solution-architecture' },
    { from: 'ai-architecture', to: 'solution-architecture' },
    { from: 'data-architecture', to: 'security-review' },
    { from: 'ai-architecture', to: 'security-review' },
    { from: 'solution-architecture', to: 'security-review' },
    { from: 'solution-architecture', to: 'qa-planning' },
    { from: 'security-review', to: 'qa-planning' },
    { from: 'security-review', to: 'estimation' },
    { from: 'qa-planning', to: 'estimation' },
    // validation, debate, and estimation all take a global view of RKB knowledge
    // (immediateUpstream: [] in AGENT_DIGEST_CONFIG) — they do NOT depend on each
    // other. Run them in parallel, then feed their results to compilation.
    { from: 'qa-planning', to: 'validation' },
    { from: 'security-review', to: 'validation' },
    { from: 'qa-planning', to: 'debate' },
    { from: 'security-review', to: 'debate' },
    // Compilation needs estimation's output (explicit upstream) plus validates/
    // digested views of validation and debate results.
    { from: 'estimation', to: 'compilation' },
    { from: 'validation', to: 'compilation' },
    { from: 'debate', to: 'compilation' },
    // Document generators run in parallel after compilation.
    { from: 'compilation', to: 'frd' },
    { from: 'compilation', to: 'user-stories' },
    { from: 'compilation', to: 'tech-arch' },
    { from: 'compilation', to: 'db-design' },
    { from: 'compilation', to: 'api-spec' },
    { from: 'compilation', to: 'sow' },
    // Build-prompt generation runs after compilation.
    { from: 'compilation', to: 'build-prompt' },
    // Gap analysis runs after every document generator AND build-prompt.
    { from: 'frd', to: 'gap-analysis' },
    { from: 'user-stories', to: 'gap-analysis' },
    { from: 'tech-arch', to: 'gap-analysis' },
    { from: 'db-design', to: 'gap-analysis' },
    { from: 'api-spec', to: 'gap-analysis' },
    { from: 'sow', to: 'gap-analysis' },
    { from: 'build-prompt', to: 'gap-analysis' },
  ],
};

/**
 * Small self-contained DAG used as a smoke-test path. Its executors are
 * registered in DagEngineModule (demo handlers) so the engine can be exercised
 * end-to-end without LLM keys. Real agent adapters are the production
 * integration point.
 */
export const SANITY_DAG: WorkflowDagDefinition = {
  key: 'sanity',
  name: 'Sanity DAG (demo)',
  description:
    'Demo DAG: discovery checkpoint -> parallel research/business-analysis -> product-analysis (optional) -> requirements-engineering.',
  nodes: [
    { key: 'sanity-discovery', label: 'Discovery', checkpoint: true },
    { key: 'sanity-research', label: 'Research' },
    { key: 'sanity-business-analysis', label: 'Business Analysis' },
    { key: 'sanity-product-analysis', label: 'Product Analysis', optional: true },
    { key: 'sanity-requirements-engineering', label: 'Requirements Engineering' },
  ],
  edges: [
    { from: 'sanity-discovery', to: 'sanity-research' },
    { from: 'sanity-discovery', to: 'sanity-business-analysis' },
    { from: 'sanity-research', to: 'sanity-business-analysis' },
    { from: 'sanity-research', to: 'sanity-product-analysis' },
    { from: 'sanity-business-analysis', to: 'sanity-requirements-engineering' },
    { from: 'sanity-product-analysis', to: 'sanity-requirements-engineering' },
  ],
};

export const DAG_DEFINITIONS: Record<string, WorkflowDagDefinition> = {
  [CRYSTALLIZE_PIPELINE_DAG.key]: CRYSTALLIZE_PIPELINE_DAG,
  [SANITY_DAG.key]: SANITY_DAG,
};

export function getDagDefinition(key: string): WorkflowDagDefinition {
  const def = DAG_DEFINITIONS[key];
  if (!def) throw new Error(`Unknown DAG definition: ${key}`);
  return def;
}

