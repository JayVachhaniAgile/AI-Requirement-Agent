/**
 * Single source of truth for pipeline order (shared by Nest DAG + React UI).
 *
 * Reconciliation notes:
 * - Business Analysis runs before Product Analysis (PM schema refs BR-* IDs).
 * - Critic/Debate open references are allowed near the end of the pipeline.
 */

export interface PipelineStage {
  key: string;
  projectStatus: string;
}

/** Full PRD pipeline order (23 stages). */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { key: "DISCOVERY", projectStatus: "DISCOVERING" },
  { key: "RESEARCH", projectStatus: "RESEARCHING" },
  { key: "BUSINESS_ANALYSIS", projectStatus: "ANALYSING" },
  { key: "PRODUCT_ANALYSIS", projectStatus: "ANALYSING" },
  { key: "REQUIREMENTS_ENGINEERING", projectStatus: "GENERATING_REQUIREMENTS" },
  { key: "UX_DESIGN", projectStatus: "DESIGNING" },
  { key: "DATA_ARCHITECTURE", projectStatus: "ARCHITECTING" },
  { key: "AI_ARCHITECTURE", projectStatus: "ARCHITECTING" },
  { key: "SOLUTION_ARCHITECTURE", projectStatus: "ARCHITECTING" },
  { key: "SECURITY_REVIEW", projectStatus: "SECURITY_REVIEW" },
  { key: "QA_PLANNING", projectStatus: "QA_ANALYSIS" },
  { key: "ESTIMATION", projectStatus: "ESTIMATING" },
  { key: "VALIDATION", projectStatus: "VALIDATING" },
  { key: "DEBATE", projectStatus: "VALIDATING" },
  { key: "COMPILATION", projectStatus: "COMPILING" },
  { key: "FRD_GENERATION", projectStatus: "COMPILING" },
  { key: "USER_STORIES_GENERATION", projectStatus: "COMPILING" },
  { key: "TECH_ARCH_GENERATION", projectStatus: "COMPILING" },
  { key: "DB_DESIGN_GENERATION", projectStatus: "COMPILING" },
  { key: "API_SPEC_GENERATION", projectStatus: "COMPILING" },
  { key: "SOW_GENERATION", projectStatus: "COMPILING" },
  { key: "BUILD_PROMPT_GENERATION", projectStatus: "COMPILING" },
  { key: "GAP_ANALYSIS", projectStatus: "GAP_ANALYSIS_REVIEW" },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

export function stageKeyToAgentKey(stageKey: string): string {
  return stageKey.toLowerCase().replace(/_/g, "-");
}

/** Ordered agent keys derived from stages (includes long document-stage keys). */
export const PIPELINE_AGENT_ORDER: readonly string[] = PIPELINE_STAGES.map((s) =>
  stageKeyToAgentKey(s.key),
);

export function getPipelinePosition(agentKey: string): number {
  return PIPELINE_AGENT_ORDER.indexOf(agentKey);
}

/**
 * Which agent produces each externalId prefix (ID-dependency lock).
 */
export const ID_PREFIX_PRODUCERS: Record<string, string> = {
  FACT: "discovery",
  ASM: "discovery",
  BG: "discovery",
  UG: "discovery",
  USER: "discovery",
  COMP: "research",
  TECH: "research",
  API: "research",
  COMPL: "research",
  STD: "research",
  RRISK: "research",
  BO: "business-analysis",
  STK: "business-analysis",
  BR: "business-analysis",
  RULE: "business-analysis",
  RISK: "business-analysis",
  "ASM-B": "business-analysis",
  PER: "product-analysis",
  MOD: "product-analysis",
  FEAT: "product-analysis",
  FR: "requirements-engineering",
  US: "requirements-engineering",
  UXP: "ux-design",
  JOURNEY: "ux-design",
  SCR: "ux-design",
  UXG: "ux-design",
  A11Y: "ux-design",
  WF: "ux-design",
  TBL: "data-architecture",
  REL: "data-architecture",
  DCON: "data-architecture",
  IDX: "data-architecture",
  DD: "data-architecture",
  LLM: "ai-architecture",
  PROMPT: "ai-architecture",
  EMB: "ai-architecture",
  VEC: "ai-architecture",
  MEM: "ai-architecture",
  GRD: "ai-architecture",
  CMP: "solution-architecture",
  "API-SPEC": "solution-architecture",
  EVT: "solution-architecture",
  INF: "solution-architecture",
  DEP: "solution-architecture",
  OBS: "solution-architecture",
  "SEC-AUTH": "security-review",
  OWASP: "security-review",
  "SEC-ENC": "security-review",
  "SEC-API": "security-review",
  "SEC-COMP": "security-review",
  THREAT: "security-review",
  TP: "qa-planning",
  TC: "qa-planning",
  REG: "qa-planning",
  PERF: "qa-planning",
  STEST: "qa-planning",
  TEAM: "estimation",
  TIME: "estimation",
  COST: "estimation",
  SPRINT: "estimation",
  ERISK: "estimation",
  VAL: "validation",
};

export interface ReferenceRulesInput {
  allowedPrefixes?: readonly string[];
}

export function assertNoForwardReferences(
  referenceRules: Record<string, readonly ReferenceRulesInput[]>,
): string[] {
  const violations: string[] = [];

  for (const [agentKey, rules] of Object.entries(referenceRules)) {
    const consumerPosition = getPipelinePosition(agentKey);
    if (consumerPosition === -1) {
      violations.push(`Agent '${agentKey}' is not part of the pipeline order`);
      continue;
    }

    for (const rule of rules) {
      const allowedPrefixes = rule.allowedPrefixes ?? [];
      if (allowedPrefixes.length === 0) continue;

      for (const prefix of allowedPrefixes) {
        const producer = ID_PREFIX_PRODUCERS[prefix];
        if (!producer) {
          violations.push(`Agent '${agentKey}' references unknown prefix '${prefix}'`);
          continue;
        }
        const producerPosition = getPipelinePosition(producer);
        if (producerPosition === -1) {
          violations.push(`Prefix '${prefix}' maps to unknown agent '${producer}'`);
          continue;
        }
        if (producerPosition > consumerPosition) {
          violations.push(
            `Agent '${agentKey}' references prefix '${prefix}' produced by '${producer}' ` +
              `(position ${producerPosition}), which runs after it (position ${consumerPosition})`,
          );
        }
      }
    }
  }

  return violations;
}

/** Stage key → generated document type. */
export const STAGE_DOCUMENT_TYPES: Readonly<Partial<Record<PipelineStageKey, string>>> = {
  COMPILATION: "COMPILED_DOCUMENT",
  FRD_GENERATION: "FRD_DOCUMENT",
  USER_STORIES_GENERATION: "USER_STORIES_DOCUMENT",
  TECH_ARCH_GENERATION: "TECH_ARCH_DOCUMENT",
  DB_DESIGN_GENERATION: "DB_DESIGN_DOCUMENT",
  API_SPEC_GENERATION: "API_SPEC_DOCUMENT",
  SOW_GENERATION: "SOW_DOCUMENT",
  BUILD_PROMPT_GENERATION: "BUILD_PROMPT_DOCUMENT",
};

/** Canonical document type strings (UI + persistence). */
export const DOCUMENT_TYPES = [
  "COMPILED_DOCUMENT",
  "FRD_DOCUMENT",
  "USER_STORIES_DOCUMENT",
  "TECH_ARCH_DOCUMENT",
  "DB_DESIGN_DOCUMENT",
  "API_SPEC_DOCUMENT",
  "SOW_DOCUMENT",
  "BUILD_PROMPT_DOCUMENT",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  COMPILED_DOCUMENT: "Compiled Document",
  FRD_DOCUMENT: "Functional Requirements",
  USER_STORIES_DOCUMENT: "User Stories & Acceptance",
  TECH_ARCH_DOCUMENT: "Technical Architecture",
  DB_DESIGN_DOCUMENT: "Database Design",
  API_SPEC_DOCUMENT: "API Specification",
  SOW_DOCUMENT: "Scope of Work",
  BUILD_PROMPT_DOCUMENT: "Build Prompt",
};

/**
 * Agent key (UI / regen aliases) → pipeline stage.
 */
export const AGENT_TO_STAGE: Readonly<Record<string, PipelineStageKey>> = {
  frd: "FRD_GENERATION",
  "frd-generation": "FRD_GENERATION",
  "user-stories": "USER_STORIES_GENERATION",
  "user-stories-generation": "USER_STORIES_GENERATION",
  "tech-arch": "TECH_ARCH_GENERATION",
  "tech-arch-generation": "TECH_ARCH_GENERATION",
  "db-design": "DB_DESIGN_GENERATION",
  "db-design-generation": "DB_DESIGN_GENERATION",
  "api-spec": "API_SPEC_GENERATION",
  "api-spec-generation": "API_SPEC_GENERATION",
  sow: "SOW_GENERATION",
  "sow-generation": "SOW_GENERATION",
  "build-prompt-generation": "BUILD_PROMPT_GENERATION",
  "build-prompt": "BUILD_PROMPT_GENERATION",
  "gap-analysis": "GAP_ANALYSIS",
  compiler: "COMPILATION",
  compilation: "COMPILATION",
};

export function resolveStageForAgent(agentKey: string): PipelineStageKey | null {
  const mapped = AGENT_TO_STAGE[agentKey];
  if (mapped) return mapped;
  const converted = agentKey.toUpperCase().replace(/-/g, "_") as PipelineStageKey;
  return PIPELINE_STAGES.some((s) => s.key === converted) ? converted : null;
}
