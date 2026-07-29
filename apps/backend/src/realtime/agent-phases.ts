export interface AgentPhaseDef {
  id: string;
  label: string;
}

/**
 * Activity checklist per agentKey (matches WorkflowService:
 * stage.toLowerCase().replace(/_/g, '-')).
 */
export const AGENT_PHASES: Record<string, AgentPhaseDef[]> = {
  discovery: [
    { id: 'analyze-idea', label: 'Analyzing business idea & scope' },
    { id: 'extract-goals', label: 'Extracting goals and user types' },
    { id: 'draft-assumptions', label: 'Drafting assumptions and risks' },
    { id: 'clarify', label: 'Preparing clarification questions' },
    { id: 'summarize', label: 'Writing discovery summary' },
  ],
  research: [
    { id: 'market', label: 'Researching market landscape' },
    { id: 'competitors', label: 'Comparing competitors' },
    { id: 'tech', label: 'Suggesting technology stack' },
    { id: 'compliance', label: 'Checking compliance notes' },
    { id: 'summarize', label: 'Writing research summary' },
  ],
  'business-analysis': [
    { id: 'processes', label: 'Mapping business processes' },
    { id: 'rules', label: 'Defining business rules' },
    { id: 'stakeholders', label: 'Identifying stakeholders' },
    { id: 'summarize', label: 'Writing BA summary' },
  ],
  'product-analysis': [
    { id: 'vision', label: 'Shaping product vision' },
    { id: 'mvp', label: 'Defining MVP scope' },
    { id: 'features', label: 'Prioritizing features' },
    { id: 'roadmap', label: 'Drafting roadmap' },
  ],
  'requirements-engineering': [
    { id: 'frs', label: 'Writing functional requirements' },
    { id: 'stories', label: 'Creating user stories' },
    { id: 'acceptance', label: 'Adding acceptance criteria' },
    { id: 'nfrs', label: 'Capturing non-functional requirements' },
  ],
  'ux-design': [
    { id: 'personas', label: 'Defining personas & journeys' },
    { id: 'screens', label: 'Inventorying screens' },
    { id: 'nav', label: 'Designing navigation flow' },
    { id: 'a11y', label: 'Adding accessibility guidelines' },
    { id: 'wireframes', label: 'Describing wireframes' },
  ],
  'data-architecture': [
    { id: 'er', label: 'Designing ER model' },
    { id: 'tables', label: 'Defining tables & columns' },
    { id: 'relations', label: 'Mapping relationships' },
    { id: 'indexes', label: 'Planning indexes & constraints' },
  ],
  'ai-architecture': [
    { id: 'pipeline', label: 'Designing AI system architecture' },
    { id: 'llm', label: 'Selecting LLM & prompt strategy' },
    { id: 'vectors', label: 'Planning embeddings & vector store' },
    { id: 'guardrails', label: 'Defining AI guardrails' },
    { id: 'diagrams', label: 'Creating technical diagrams' },
  ],
  'solution-architecture': [
    { id: 'system', label: 'Designing system architecture' },
    { id: 'apis', label: 'Specifying API contracts' },
    { id: 'infra', label: 'Planning infrastructure' },
    { id: 'deploy', label: 'Defining deployment strategy' },
  ],
  'security-review': [
    { id: 'auth', label: 'Reviewing authn / authz' },
    { id: 'owasp', label: 'Scanning OWASP risks' },
    { id: 'threats', label: 'Building threat model' },
    { id: 'report', label: 'Writing security report' },
  ],
  'qa-planning': [
    { id: 'strategy', label: 'Defining test strategy' },
    { id: 'functional', label: 'Writing functional test cases' },
    { id: 'regression', label: 'Planning regression suite' },
    { id: 'security-tests', label: 'Adding security tests' },
  ],
  estimation: [
    { id: 'complexity', label: 'Assessing complexity' },
    { id: 'team', label: 'Sizing team composition' },
    { id: 'timeline', label: 'Building timeline & sprints' },
    { id: 'cost', label: 'Estimating cost & risks' },
  ],
  validation: [
    { id: 'consistency', label: 'Checking cross-agent consistency' },
    { id: 'gaps', label: 'Finding requirement gaps' },
    { id: 'scores', label: 'Scoring completeness & confidence' },
    { id: 'issues', label: 'Logging validation issues' },
  ],
  compilation: [
    { id: 'gather', label: 'Gathering knowledge base' },
    { id: 'assemble', label: 'Assembling document sections' },
    { id: 'executive', label: 'Writing executive summary' },
    { id: 'finalize', label: 'Finalizing requirements document' },
  ],
  compiler: [
    { id: 'gather', label: 'Gathering knowledge base' },
    { id: 'assemble', label: 'Assembling document sections' },
    { id: 'executive', label: 'Writing executive summary' },
    { id: 'finalize', label: 'Finalizing requirements document' },
  ],
};

export function getPhasesForAgent(agentKey: string): AgentPhaseDef[] {
  return AGENT_PHASES[agentKey] ?? [
    { id: 'run', label: 'Running agent' },
    { id: 'persist', label: 'Persisting outputs' },
    { id: 'done', label: 'Finalizing' },
  ];
}

export const STAGE_TO_AGENT: Record<string, string> = {
  DISCOVERY: 'discovery',
  RESEARCH: 'research',
  BUSINESS_ANALYSIS: 'business-analysis',
  PRODUCT_ANALYSIS: 'product-analysis',
  REQUIREMENTS_ENGINEERING: 'requirements-engineering',
  UX_DESIGN: 'ux-design',
  DATA_ARCHITECTURE: 'data-architecture',
  AI_ARCHITECTURE: 'ai-architecture',
  SOLUTION_ARCHITECTURE: 'solution-architecture',
  SECURITY_REVIEW: 'security-review',
  QA_PLANNING: 'qa-planning',
  ESTIMATION: 'estimation',
  VALIDATION: 'validation',
  DEBATE: 'debate',
  COMPILATION: 'compilation',
};

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  discovery: 'Discovery Agent',
  research: 'Research Agent',
  'business-analysis': 'Business Analyst',
  'product-analysis': 'Product Manager',
  'requirements-engineering': 'Requirements Agent',
  'ux-design': 'UX Agent',
  'data-architecture': 'Data Architect',
  'ai-architecture': 'AI Architect',
  'solution-architecture': 'Solution Architect',
  'security-review': 'Security Agent',
  'qa-planning': 'QA Agent',
  estimation: 'Estimation Agent',
  validation: 'Critic Agent',
  debate: 'Debate Agent',
  compilation: 'Compiler Agent',
  compiler: 'Compiler Agent',
};

/** Default stage duration estimates (seconds) when no history exists. */
export const DEFAULT_STAGE_SECONDS: Record<string, number> = {
  DISCOVERY: 90,
  RESEARCH: 120,
  BUSINESS_ANALYSIS: 100,
  PRODUCT_ANALYSIS: 100,
  REQUIREMENTS_ENGINEERING: 150,
  UX_DESIGN: 120,
  DATA_ARCHITECTURE: 110,
  AI_ARCHITECTURE: 110,
  SOLUTION_ARCHITECTURE: 130,
  SECURITY_REVIEW: 100,
  QA_PLANNING: 100,
  ESTIMATION: 90,
  VALIDATION: 120,
  DEBATE: 90,
  COMPILATION: 60,
};
