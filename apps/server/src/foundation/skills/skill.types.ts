/**
 * Specialized AI Skill contract (Phase 5).
 *
 * A skill is a reusable, structured AI capability. It declares what it does,
 * what context it needs, what artifacts it produces, which model it uses,
 * how the output is validated, which quality gates apply and which skills
 * it depends on.
 *
 * A skill NEVER directly persists arbitrary LLM output — every result goes
 * through schema validation → normalization → business validation →
 * provenance → dependency validation before becoming canonical data.
 */
import type { ContextRequest, ContextPackage } from '../context/context.types';
import type { CanonicalKind } from '../canonical/canonical.types';
import type { AgentModelTier } from '../../llm/agent-model.config';

export const SKILL_STATUS = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const;
export type SkillStatus = (typeof SKILL_STATUS)[number];

export interface SkillValidationRule {
  /** Field-level rule, e.g. `minItems`, `regex`, `refFormat`. */
  code: string;
  /** Friendly message used by the runtime to surface failures. */
  message: string;
  /** Optional severity: `error` (default) or `warning`. */
  severity?: 'error' | 'warning';
}

export interface SkillDependency {
  /** Skill key this skill depends on. */
  skillKey: string;
  /** Required relationship from the dependency graph (`IMPLEMENTS`, etc.). */
  relation?: 'IMPLEMENTS' | 'DEPENDS_ON' | 'REFINES' | 'DERIVED_FROM';
  /** When true, a failure in the dependency aborts this skill. */
  required?: boolean;
}

export interface SkillTool {
  /** Stable tool name (matches `agent-json-schemas.ts` forced tool name). */
  name: string;
  /** JSON Schema for the tool's input. */
  schema: Record<string, unknown>;
}

export interface SkillDefinition {
  /** Stable skill key (workflow / registry key). */
  key: string;
  name: string;
  description: string;
  version: string;
  status: SkillStatus;
  /** Tier used by the model router. */
  modelTier: AgentModelTier;
  /** Prompt template key (PromptBuilder registry). */
  promptKey: string;
  /** Hard output token ceiling (provider max output). */
  maxTokens: number;
  /** Token budget for the context package (engine scopes retrieval to this). */
  tokenBudget: number;
  /** JSON Schema for the skill's input. */
  inputSchema: Record<string, unknown>;
  /** JSON Schema for the skill's output. */
  outputSchema: Record<string, unknown>;
  /** Canonical kinds this skill may produce. */
  producedArtifacts: CanonicalKind[];
  /** Required context domains for the skill. */
  requiredContext: string[];
  /** Validation rules checked before output becomes canonical. */
  validationRules: SkillValidationRule[];
  /** Quality gates run on the produced output. */
  qualityGates: string[];
  /** Skill-to-skill dependencies (execution ordering hints). */
  dependencies: SkillDependency[];
  /** Forced structured-output tool. */
  tool?: SkillTool;
  /** Free-form metadata (owner, schedule, etc.). */
  metadata?: Record<string, unknown>;
}

/** Standardized skill input (every skill receives one of these). */
export interface SkillInput {
  projectId: string;
  workflowExecutionId?: string;
  skillId?: string;
  /** Natural-language or structured task description. */
  task: string;
  /** Context package built by the Context Engine. */
  contextPackage?: ContextPackage;
  /** Pinned artifact ids the caller wants the skill to consume. */
  artifactIds?: string[];
  /** Per-call overrides. */
  configuration?: Record<string, unknown>;
}

/** Standardized skill output (every skill produces one of these). */
export interface SkillOutput {
  /** Canonical-kind payloads — become canonical items after validation. */
  artifacts: Array<{
    kind: CanonicalKind;
    externalId: string;
    title: string;
    summary?: string;
    body: Record<string, unknown>;
    epistemicClass: 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'USER_DECISION';
    sources: Array<{ category: string; refId?: string; label?: string }>;
    confidence?: number;
  }>;
  /** Open questions surfaced during the skill. */
  questions: Array<{ prompt: string; context?: string; isBlocking: boolean }>;
  /** Assumptions the skill had to make to produce output. */
  assumptions: Array<{ statement: string; impactIfViolated?: string }>;
  /** Architecture/business decisions recorded as canonical architecture_decision. */
  decisions: Array<{ statement: string; rationale: string }>;
  /** Validation issues the caller should route to critic/debate. */
  validationIssues: Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    problem: string;
    impact?: string;
    recommendedCorrection?: string;
  }>;
  /** Self-reported confidence (0-100). */
  confidence: number;
  /** Free-form metadata (timings, prompt version, etc.). */
  metadata?: Record<string, unknown>;
}

/** Standardized execution record (persisted via AgentSkillExecution + ModelUsage). */
export interface SkillExecutionRecord {
  skillKey: string;
  skillVersion: string;
  projectId: string;
  workflowExecutionId?: string;
  skillExecutionId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  retryCount: number;
  qualityScore?: number;
  error?: string;
}

/** Build the default `ContextRequest` for a skill. */
export function defaultContextRequest(input: SkillInput, def: SkillDefinition): ContextRequest {
  const taskType = mapTaskType(def.key);
  return {
    projectId: input.projectId,
    agentSkill: def.key,
    taskType,
    artifactIds: input.artifactIds,
    domains: def.requiredContext,
    requiredRelationships: def.dependencies
      .map((d) => d.relation)
      .filter((r): r is NonNullable<typeof r> => !!r),
    evidenceRequired: true,
    maxTokens: def.tokenBudget,
    includeDirectDependencies: def.dependencies.length > 0,
    dependencyMaxDepth: 2,
  };
}

function mapTaskType(skillKey: string): ContextRequest['taskType'] {
  const map: Record<string, ContextRequest['taskType']> = {
    discovery: 'discovery',
    research: 'research',
    'business-analysis': 'document',
    'product-analysis': 'document',
    'requirements-engineering': 'requirements',
    'ux-design': 'ux',
    'data-architecture': 'database',
    'ai-architecture': 'architecture',
    'solution-architecture': 'architecture',
    'security-review': 'security',
    'qa-planning': 'testing',
    estimation: 'estimation',
    validation: 'validation',
    debate: 'validation',
    'gap-analysis': 'gap_analysis',
  };
  return map[skillKey] ?? 'document';
}
