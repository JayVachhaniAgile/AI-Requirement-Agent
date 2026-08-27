/**
 * Relationship graph layers — derived, never stored. Maps each knowledge
 * domain to a visualization layer so the graph renders as a layered DAG
 * (Business -> Product -> Requirements -> Design & Architecture -> Delivery
 * -> Cross-cutting).
 */
export const LAYERS = [
  { id: 'business', label: 'Business' },
  { id: 'product', label: 'Product' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'architecture', label: 'Design & Architecture' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'cross-cutting', label: 'Cross-cutting' },
] as const;

export type LayerId = (typeof LAYERS)[number]['id'];

export const DOMAIN_LAYER: Record<string, string> = {
  business_goals: 'business',
  stakeholders: 'business',
  epics: 'product',
  features: 'product',
  personas: 'product',
  actors: 'product',
  processes: 'product',
  functional_requirements: 'requirements',
  non_functional_requirements: 'requirements',
  business_rules: 'requirements',
  user_stories: 'requirements',
  acceptance_criteria: 'requirements',
  apis: 'architecture',
  database_tables: 'architecture',
  ui_screens: 'architecture',
  test_cases: 'delivery',
  document_summaries: 'delivery',
  risks: 'cross-cutting',
  constraints: 'cross-cutting',
  assumptions: 'cross-cutting',
  decisions: 'cross-cutting',
  questions: 'cross-cutting',
  glossary: 'cross-cutting',
  domain_knowledge: 'cross-cutting',
};

export function layerOf(domain: string): string {
  return DOMAIN_LAYER[domain] ?? 'cross-cutting';
}

export function isLayerId(value: string): value is LayerId {
  return (LAYERS as readonly { id: string }[]).some((l) => l.id === value);
}
