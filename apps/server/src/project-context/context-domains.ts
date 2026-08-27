/**
 * Canonical Project Context domains.
 *
 * Every artifact stored in the shared Project Context belongs to exactly one of
 * these 16 domains. Domains are the unit of filtering, versioning, and
 * conflict resolution — agents write and read domain-scoped items instead of
 * passing outputs directly to each other.
 */
export const CONTEXT_DOMAINS = [
  'business_goals',
  'functional_requirements',
  'non_functional_requirements',
  'processes',
  'business_rules',
  'actors',
  'assumptions',
  'constraints',
  'risks',
  'decisions',
  'questions',
  'glossary',
  'stakeholders',
  'features',
  'epics',
  'apis',
  'database_tables',
  'ui_screens',
  'test_cases',
  'personas',
  'user_stories',
  'acceptance_criteria',
  'domain_knowledge',
  'document_summaries',
] as const;

export type ContextDomain = (typeof CONTEXT_DOMAINS)[number];

export const ALL_DOMAINS: readonly ContextDomain[] = CONTEXT_DOMAINS;

export const DOMAIN_LABELS: Record<ContextDomain, string> = {
  business_goals: 'Business Goals',
  functional_requirements: 'Functional Requirements',
  non_functional_requirements: 'Non-Functional Requirements',
  processes: 'Processes',
  business_rules: 'Business Rules',
  actors: 'Actors',
  assumptions: 'Assumptions',
  constraints: 'Constraints',
  risks: 'Risks',
  decisions: 'Decisions',
  questions: 'Questions',
  glossary: 'Glossary',
  stakeholders: 'Stakeholders',
  features: 'Features',
  epics: 'Epics',
  apis: 'APIs',
  database_tables: 'Database Tables',
  ui_screens: 'UI Screens',
  test_cases: 'Test Cases',
  personas: 'Personas',
  user_stories: 'User Stories',
  acceptance_criteria: 'Acceptance Criteria',
  domain_knowledge: 'Domain Knowledge',
  document_summaries: 'Document Summaries',
};

export const CONTEXT_OPERATIONS = ['create', 'upsert', 'delete', 'supersede'] as const;
export type ContextOperation = (typeof CONTEXT_OPERATIONS)[number];

export function isContextDomain(value: string): value is ContextDomain {
  return (CONTEXT_DOMAINS as readonly string[]).includes(value);
}

export function isContextOperation(value: string): value is ContextOperation {
  return (CONTEXT_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Legacy `knowledge_items.type` values that belong to each domain. This is the
 * canonical mapping used by the backfill and by `domainForType`; new artifact
 * types should be registered here (and in DATA_MODEL.md) before use.
 */
export const DOMAIN_TYPES: Record<ContextDomain, readonly string[]> = {
  business_goals: [
    'BUSINESS_GOAL',
    'BUSINESS_OBJECTIVE',
    'PRODUCT_VISION',
    'SUCCESS_METRIC',
    'VALUE_PROPOSITION',
    'USER_GOAL',
  ],
  functional_requirements: ['FUNCTIONAL_REQUIREMENT', 'BUSINESS_REQUIREMENT'],
  non_functional_requirements: [
    'PERFORMANCE_TEST',
    'COMPLIANCE_NOTE',
    'SECURITY_AUTH',
    'SECURITY_COMPLIANCE',
    'SECURITY_ENCRYPTION',
    'SECURITY_REPORT',
    'API_SECURITY',
  ],
  processes: ['PROCESS', 'WORKFLOW', 'PROCESS_FLOW'],
  business_rules: ['BUSINESS_RULE', 'VALIDATION_RULE'],
  actors: ['ACTOR', 'USER_TYPE', 'EXTERNAL_SYSTEM'],
  assumptions: ['ASSUMPTION', 'RISKY_ASSUMPTION'],
  constraints: ['CONSTRAINT', 'SCOPE', 'MVP_SCOPE', 'DB_CONSTRAINT'],
  risks: ['RISK', 'BUSINESS_RISK', 'RESEARCH_RISK', 'ESTIMATION_RISK', 'THREAT_MODEL'],
  decisions: [
    'DATABASE_DESIGN',
    'INFRASTRUCTURE',
    'DEPLOYMENT',
    'EVENT_FLOW',
    'TECHNOLOGY_SUGGESTION',
    'LLM_SELECTION',
    'EMBEDDING_DESIGN',
    'VECTOR_STORE',
    'PROMPT_STRATEGY',
    'AI_MEMORY',
    'AI_ARCHITECTURE',
  ],
  questions: ['QUESTION'],
  glossary: ['GLOSSARY_TERM'],
  stakeholders: ['STAKEHOLDER'],
  features: ['FEATURE'],
  epics: ['EPIC', 'MODULE'],
  apis: ['API_SPEC', 'API_ENDPOINT', 'API_RESOURCE'],
  database_tables: ['DB_TABLE', 'DB_INDEX', 'DB_RELATIONSHIP', 'DATA_DICTIONARY'],
  ui_screens: ['SCREEN', 'UI_FLOW', 'WIREFRAME', 'USER_FLOW'],
  test_cases: ['TEST_CASE', 'TEST_PLAN_ITEM', 'QA_PLAN'],
  personas: ['PERSONA'],
  user_stories: ['USER_STORY'],
  acceptance_criteria: ['ACCEPTANCE_CRITERIA'],
  domain_knowledge: [
    'CONFIRMED_FACT',
    'DISCOVERY_SUMMARY',
    'BA_SUMMARY',
    'RESEARCH_SUMMARY',
    'INDUSTRY_STANDARD',
    'COMPETITOR',
    'API_RESEARCH',
    'DOMAIN_KNOWLEDGE',
  ],
  document_summaries: [
    'DOCUMENT_SUMMARY',
    'FRD_DOCUMENT',
    'USER_STORIES_DOCUMENT',
    'TECH_ARCH_DOCUMENT',
    'DB_DESIGN_DOCUMENT',
    'API_SPEC_DOCUMENT',
    'SOW_DOCUMENT',
    'COMPILED_DOCUMENT',
  ],
};

/** Resolve the canonical domain for a legacy knowledge item type (or null). */
export function domainForType(type: string): ContextDomain | null {
  for (const domain of CONTEXT_DOMAINS) {
    if (DOMAIN_TYPES[domain].includes(type)) return domain;
  }
  return null;
}

export function typesForDomain(domain: ContextDomain): readonly string[] {
  return DOMAIN_TYPES[domain];
}

/**
 * Domains each consumer agent reads. Drives `GET /context/digest` filtering:
 * consumers only receive the domains they declare, and the detail tiering from
 * `AGENT_DIGEST_CONFIG` (full for immediate upstream, digest for the rest) is
 * applied on top.
 */
export const AGENT_CONSUMED_DOMAINS: Record<string, readonly ContextDomain[]> = {
  discovery: ALL_DOMAINS,
  research: [
    'business_goals',
    'assumptions',
    'constraints',
    'risks',
    'domain_knowledge',
    'questions',
  ],
  'business-analysis': [
    'business_goals',
    'functional_requirements',
    'business_rules',
    'stakeholders',
    'actors',
    'assumptions',
    'constraints',
    'risks',
    'domain_knowledge',
    'questions',
  ],
  'product-analysis': [
    'business_goals',
    'functional_requirements',
    'stakeholders',
    'actors',
    'personas',
    'features',
    'epics',
    'user_stories',
    'questions',
    'assumptions',
    'constraints',
  ],
  'requirements-engineering': [
    'business_goals',
    'functional_requirements',
    'non_functional_requirements',
    'processes',
    'business_rules',
    'actors',
    'assumptions',
    'constraints',
    'risks',
    'decisions',
    'questions',
    'glossary',
    'stakeholders',
    'features',
    'epics',
    'personas',
    'user_stories',
    'acceptance_criteria',
  ],
  'ux-design': [
    'personas',
    'actors',
    'processes',
    'ui_screens',
    'user_stories',
    'features',
    'functional_requirements',
    'non_functional_requirements',
    'constraints',
    'questions',
  ],
  'data-architecture': [
    'functional_requirements',
    'non_functional_requirements',
    'constraints',
    'decisions',
    'database_tables',
    'domain_knowledge',
    'risks',
  ],
  'ai-architecture': [
    'functional_requirements',
    'non_functional_requirements',
    'constraints',
    'decisions',
    'apis',
    'database_tables',
    'domain_knowledge',
    'risks',
    'questions',
  ],
  'solution-architecture': [
    'decisions',
    'constraints',
    'non_functional_requirements',
    'functional_requirements',
    'apis',
    'database_tables',
    'ui_screens',
    'domain_knowledge',
    'risks',
  ],
  'security-review': [
    'non_functional_requirements',
    'constraints',
    'risks',
    'decisions',
    'domain_knowledge',
  ],
  'qa-planning': [
    'functional_requirements',
    'non_functional_requirements',
    'user_stories',
    'acceptance_criteria',
    'test_cases',
    'risks',
    'constraints',
  ],
  estimation: ['functional_requirements', 'features', 'constraints', 'risks', 'assumptions'],
  validation: ALL_DOMAINS,
  debate: ALL_DOMAINS,
  compilation: ALL_DOMAINS,
  'frd-generation': ALL_DOMAINS,
  'user-stories-generation': ALL_DOMAINS,
  'tech-arch-generation': ALL_DOMAINS,
  'db-design-generation': ALL_DOMAINS,
  'api-spec-generation': ALL_DOMAINS,
  'sow-generation': ALL_DOMAINS,
  'gap-analysis': ALL_DOMAINS,
};

export function domainsForAgent(agentKey: string): readonly ContextDomain[] {
  return AGENT_CONSUMED_DOMAINS[agentKey] ?? ALL_DOMAINS;
}
