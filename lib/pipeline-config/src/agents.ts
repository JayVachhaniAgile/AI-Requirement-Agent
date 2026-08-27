import {
  PIPELINE_STAGES,
  type PipelineStageKey,
  STAGE_DOCUMENT_TYPES,
} from "./stages";

export interface AgentPhaseDef {
  id: string;
  label: string;
}

/**
 * Activity checklist per agentKey (canonical short keys for document stages).
 */
export const AGENT_PHASES: Record<string, AgentPhaseDef[]> = {
  discovery: [
    { id: "analyze-idea", label: "Analyzing business idea & scope" },
    { id: "extract-goals", label: "Extracting goals and user types" },
    { id: "draft-assumptions", label: "Drafting assumptions and risks" },
    { id: "clarify", label: "Preparing clarification questions" },
    { id: "summarize", label: "Writing discovery summary" },
  ],
  research: [
    { id: "market", label: "Researching market landscape" },
    { id: "competitors", label: "Comparing competitors" },
    { id: "tech", label: "Suggesting technology stack" },
    { id: "compliance", label: "Checking compliance notes" },
    { id: "summarize", label: "Writing research summary" },
  ],
  "business-analysis": [
    { id: "processes", label: "Mapping business processes" },
    { id: "rules", label: "Defining business rules" },
    { id: "stakeholders", label: "Identifying stakeholders" },
    { id: "summarize", label: "Writing BA summary" },
  ],
  "product-analysis": [
    { id: "vision", label: "Shaping product vision" },
    { id: "mvp", label: "Defining MVP scope" },
    { id: "features", label: "Prioritizing features" },
    { id: "roadmap", label: "Drafting roadmap" },
  ],
  "requirements-engineering": [
    { id: "frs", label: "Writing functional requirements" },
    { id: "stories", label: "Creating user stories" },
    { id: "acceptance", label: "Adding acceptance criteria" },
    { id: "nfrs", label: "Capturing non-functional requirements" },
  ],
  "ux-design": [
    { id: "personas", label: "Defining personas & journeys" },
    { id: "screens", label: "Inventorying screens" },
    { id: "nav", label: "Designing navigation flow" },
    { id: "a11y", label: "Adding accessibility guidelines" },
    { id: "wireframes", label: "Describing wireframes" },
  ],
  "data-architecture": [
    { id: "er", label: "Designing ER model" },
    { id: "tables", label: "Defining tables & columns" },
    { id: "relations", label: "Mapping relationships" },
    { id: "indexes", label: "Planning indexes & constraints" },
  ],
  "ai-architecture": [
    { id: "pipeline", label: "Designing AI system architecture" },
    { id: "llm", label: "Selecting LLM & prompt strategy" },
    { id: "vectors", label: "Planning embeddings & vector store" },
    { id: "guardrails", label: "Defining AI guardrails" },
    { id: "diagrams", label: "Creating technical diagrams" },
  ],
  "solution-architecture": [
    { id: "system", label: "Designing system architecture" },
    { id: "apis", label: "Specifying API contracts" },
    { id: "infra", label: "Planning infrastructure" },
    { id: "deploy", label: "Defining deployment strategy" },
  ],
  "security-review": [
    { id: "auth", label: "Reviewing authn / authz" },
    { id: "owasp", label: "Scanning OWASP risks" },
    { id: "threats", label: "Building threat model" },
    { id: "report", label: "Writing security report" },
  ],
  "qa-planning": [
    { id: "strategy", label: "Defining test strategy" },
    { id: "functional", label: "Writing functional test cases" },
    { id: "regression", label: "Planning regression suite" },
    { id: "security-tests", label: "Adding security tests" },
  ],
  estimation: [
    { id: "complexity", label: "Assessing complexity" },
    { id: "team", label: "Sizing team composition" },
    { id: "timeline", label: "Building timeline & sprints" },
    { id: "cost", label: "Estimating cost & risks" },
  ],
  validation: [
    { id: "consistency", label: "Checking cross-agent consistency" },
    { id: "gaps", label: "Finding requirement gaps" },
    { id: "scores", label: "Scoring completeness & confidence" },
    { id: "issues", label: "Logging validation issues" },
  ],
  debate: [
    { id: "positions", label: "Collecting agent positions" },
    { id: "debate", label: "Running structured debate" },
    { id: "summarize", label: "Writing debate summary" },
  ],
  compilation: [
    { id: "gather", label: "Gathering knowledge base" },
    { id: "assemble", label: "Assembling document sections" },
    { id: "executive", label: "Writing executive summary" },
    { id: "finalize", label: "Finalizing requirements document" },
  ],
  frd: [
    { id: "compile", label: "Compiling functional requirements" },
    { id: "structure", label: "Structuring FRD sections" },
    { id: "finalize", label: "Finalizing FRD document" },
  ],
  "user-stories": [
    { id: "stories", label: "Compiling user stories" },
    { id: "acceptance", label: "Attaching acceptance criteria" },
    { id: "finalize", label: "Finalizing user stories document" },
  ],
  "tech-arch": [
    { id: "hld", label: "Compiling technical architecture" },
    { id: "diagrams", label: "Rendering architecture diagrams" },
    { id: "finalize", label: "Finalizing tech architecture document" },
  ],
  "db-design": [
    { id: "schema", label: "Compiling database schema" },
    { id: "relations", label: "Mapping relationships & indexes" },
    { id: "finalize", label: "Finalizing DB design document" },
  ],
  "api-spec": [
    { id: "endpoints", label: "Compiling API endpoints" },
    { id: "contracts", label: "Formalizing request/response contracts" },
    { id: "finalize", label: "Finalizing API spec document" },
  ],
  sow: [
    { id: "scope", label: "Compiling project scope" },
    { id: "deliverables", label: "Listing deliverables & timeline" },
    { id: "finalize", label: "Finalizing SOW document" },
  ],
  "build-prompt": [
    { id: "assemble", label: "Assembling developer-ready build prompt" },
    { id: "structure", label: "Structuring model dump & instructions" },
    { id: "finalize", label: "Finalizing build prompt document" },
  ],
  "gap-analysis": [
    { id: "detect", label: "Detecting gaps across artifacts" },
    { id: "propose", label: "Proposing gap resolutions" },
    { id: "review", label: "Awaiting gap review" },
  ],
  compiler: [
    { id: "gather", label: "Gathering knowledge base" },
    { id: "assemble", label: "Assembling document sections" },
    { id: "executive", label: "Writing executive summary" },
    { id: "finalize", label: "Finalizing requirements document" },
  ],
};

export function getPhasesForAgent(agentKey: string): AgentPhaseDef[] {
  return (
    AGENT_PHASES[agentKey] ?? [
      { id: "run", label: "Running agent" },
      { id: "persist", label: "Persisting outputs" },
      { id: "done", label: "Finalizing" },
    ]
  );
}

/** Pipeline stage → canonical short agent key (UI / dashboard / DAG node). */
export const STAGE_TO_AGENT: Readonly<Record<PipelineStageKey, string>> = {
  DISCOVERY: "discovery",
  RESEARCH: "research",
  BUSINESS_ANALYSIS: "business-analysis",
  PRODUCT_ANALYSIS: "product-analysis",
  REQUIREMENTS_ENGINEERING: "requirements-engineering",
  UX_DESIGN: "ux-design",
  DATA_ARCHITECTURE: "data-architecture",
  AI_ARCHITECTURE: "ai-architecture",
  SOLUTION_ARCHITECTURE: "solution-architecture",
  SECURITY_REVIEW: "security-review",
  QA_PLANNING: "qa-planning",
  ESTIMATION: "estimation",
  VALIDATION: "validation",
  DEBATE: "debate",
  COMPILATION: "compilation",
  FRD_GENERATION: "frd",
  USER_STORIES_GENERATION: "user-stories",
  TECH_ARCH_GENERATION: "tech-arch",
  DB_DESIGN_GENERATION: "db-design",
  API_SPEC_GENERATION: "api-spec",
  SOW_GENERATION: "sow",
  BUILD_PROMPT_GENERATION: "build-prompt",
  GAP_ANALYSIS: "gap-analysis",
};

/** DAG / UI node key → pipeline stage (inverse of STAGE_TO_AGENT + aliases). */
export const DAG_NODE_TO_STAGE: Readonly<Record<string, PipelineStageKey>> = {
  ...Object.fromEntries(
    Object.entries(STAGE_TO_AGENT).map(([stage, agent]) => [agent, stage]),
  ),
  compiler: "COMPILATION",
} as Record<string, PipelineStageKey>;

/** Human-readable agent labels (FE + BE dashboard). */
export const AGENT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  discovery: "Discovery Agent",
  research: "Research Agent",
  "business-analysis": "Business Analyst",
  "product-analysis": "Product Manager",
  "requirements-engineering": "Requirements Agent",
  "ux-design": "UX Agent",
  "data-architecture": "Data Architect",
  "ai-architecture": "AI Architect",
  "solution-architecture": "Solution Architect",
  "security-review": "Security Agent",
  "qa-planning": "QA Agent",
  estimation: "Estimation Agent",
  validation: "Critic Agent",
  debate: "Debate Agent",
  compilation: "Compiler Agent",
  compiler: "Compiler Agent",
  frd: "FRD Generator",
  "user-stories": "User Stories Generator",
  "tech-arch": "Tech Architecture Generator",
  "db-design": "Database Design Generator",
  "api-spec": "API Spec Generator",
  sow: "SOW Generator",
  "build-prompt": "Build Prompt Generator",
  "gap-analysis": "Gap Analysis Agent",
};

/** Default stage duration estimates (seconds). */
export const DEFAULT_STAGE_SECONDS: Readonly<Record<string, number>> = {
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
  FRD_GENERATION: 45,
  USER_STORIES_GENERATION: 45,
  TECH_ARCH_GENERATION: 45,
  DB_DESIGN_GENERATION: 45,
  API_SPEC_GENERATION: 45,
  SOW_GENERATION: 45,
  BUILD_PROMPT_GENERATION: 40,
  GAP_ANALYSIS: 90,
};

/** 1-based display index for an agent key in pipeline order. */
export function getAgentDisplayIndex(agentKey: string): number {
  const canonical = agentKey === "compiler" ? "compilation" : agentKey;
  const stage = DAG_NODE_TO_STAGE[canonical];
  if (!stage) return 0;
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx + 1 : 0;
}

export function projectStatusForNode(nodeKey: string): string | undefined {
  const stage = DAG_NODE_TO_STAGE[nodeKey];
  if (!stage) return undefined;
  return PIPELINE_STAGES.find((s) => s.key === stage)?.projectStatus;
}

export function stageForNode(nodeKey: string): string | undefined {
  return DAG_NODE_TO_STAGE[nodeKey];
}

export function stageToProjectStatus(): Map<string, string> {
  return new Map(PIPELINE_STAGES.map((s) => [s.key, s.projectStatus]));
}

/** DAG node key → document type (document-producing nodes only). */
export const NODE_DOCUMENT_TYPES: Readonly<Partial<Record<string, string>>> = {
  compilation: STAGE_DOCUMENT_TYPES.COMPILATION,
  compiler: STAGE_DOCUMENT_TYPES.COMPILATION,
  frd: STAGE_DOCUMENT_TYPES.FRD_GENERATION,
  "user-stories": STAGE_DOCUMENT_TYPES.USER_STORIES_GENERATION,
  "tech-arch": STAGE_DOCUMENT_TYPES.TECH_ARCH_GENERATION,
  "db-design": STAGE_DOCUMENT_TYPES.DB_DESIGN_GENERATION,
  "api-spec": STAGE_DOCUMENT_TYPES.API_SPEC_GENERATION,
  sow: STAGE_DOCUMENT_TYPES.SOW_GENERATION,
  "build-prompt": STAGE_DOCUMENT_TYPES.BUILD_PROMPT_GENERATION,
};
