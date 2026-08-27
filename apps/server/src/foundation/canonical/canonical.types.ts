/**
 * Canonical Project Model (Phase 2).
 *
 * Strongly typed TypeScript interfaces for every object that lives inside
 * a project. LLM output is never trusted directly — it must be parsed by
 * the Zod schemas in `canonical.schemas.ts`, normalized and validated
 * before being persisted as a `CanonicalItem`.
 *
 * Object taxonomy covers 22+ kinds grouped into:
 *   - project: Project
 *   - goals:   ProjectGoal
 *   - actors:  Actor
 *   - context: Domain, BusinessProcess, BusinessRule, Assumption, Constraint
 *   - risks:   Risk, Question
 *   - reqs:    Requirement, NonFunctionalRequirement
 *   - ux:      Screen
 *   - stories: UserStory, AcceptanceCriterion
 *   - arch:    Entity, Relationship, API, SecurityRequirement, ArchitectureDecision
 *   - qa:      TestCase
 *   - plan:    Estimate, ScopeItem
 */

export type CanonicalKind =
  | 'project'
  | 'project_goal'
  | 'actor'
  | 'domain'
  | 'business_process'
  | 'requirement'
  | 'non_functional_requirement'
  | 'business_rule'
  | 'assumption'
  | 'constraint'
  | 'risk'
  | 'question'
  | 'user_story'
  | 'acceptance_criterion'
  | 'entity'
  | 'relationship'
  | 'screen'
  | 'api'
  | 'security_requirement'
  | 'architecture_decision'
  | 'test_case'
  | 'estimate'
  | 'scope_item';

export const CANONICAL_KINDS = [
  'project',
  'project_goal',
  'actor',
  'domain',
  'business_process',
  'requirement',
  'non_functional_requirement',
  'business_rule',
  'assumption',
  'constraint',
  'risk',
  'question',
  'user_story',
  'acceptance_criterion',
  'entity',
  'relationship',
  'screen',
  'api',
  'security_requirement',
  'architecture_decision',
  'test_case',
  'estimate',
  'scope_item',
] as const;

export const CANONICAL_STATUS = [
  'DRAFT',
  'PROPOSED',
  'CONFIRMED',
  'INFERRED',
  'ASSUMED',
  'REJECTED',
  'DEPRECATED',
] as const;
export type CanonicalStatus = (typeof CANONICAL_STATUS)[number];

/** Epistemic provenance — answers "where did this come from?". */
export const SOURCE_CATEGORY = [
  'uploaded_document',
  'user_input',
  'research',
  'interview',
  'artifact',
  'user_decision',
  'ai_inference',
  'ai_assumption',
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORY)[number];

/** "How confident are we in the epistemic class of this object?" */
export const EPISTEMIC_CLASS = ['FACT', 'INFERENCE', 'ASSUMPTION', 'USER_DECISION'] as const;
export type EpistemicClass = (typeof EPISTEMIC_CLASS)[number];

export interface SourceRef {
  category: SourceCategory;
  /** Free-form pointer: doc id, agent key, artifact id, interview id, ... */
  refId?: string;
  /** Optional human label for UI display. */
  label?: string;
  /** Optional supporting excerpt. */
  excerpt?: string;
}

export interface Provenance {
  epistemicClass: EpistemicClass;
  /** All sources contributing to this object's existence / content. */
  sources: SourceRef[];
  /** Skill/agent key that produced the structured object. */
  producedBy?: string;
  /** Schema version enforced at validation time. */
  schemaVersion?: string;
}

export interface ConfidenceScore {
  /** 0-100, mandatory when epistemic class is INFERENCE or ASSUMPTION. */
  value: number;
  /** Short reason when value < 70 (low-confidence). */
  reason?: string;
}

export interface RequirementStructured {
  classification: 'functional' | 'non_functional';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  actors: string[];
  preconditions: string[];
  postconditions: string[];
  businessRuleRefs: string[];
  acceptanceCriteriaRefs: string[];
  dependencies: string[];
  sourceRefs: SourceRef[];
  assumptions: string[];
  confidence: ConfidenceScore;
  validationStatus: 'UNVALIDATED' | 'VALIDATED' | 'FLAGGED' | 'REJECTED';
}

export interface CanonicalObjectBase {
  projectId: string;
  kind: CanonicalKind;
  /** Caller-provided stable identifier (externalId). Required, non-empty. */
  externalId: string;
  title: string;
  summary?: string;
  status: CanonicalStatus;
  version: number;
  provenance: Provenance;
  /** Structural body — kept open; each kind defines its own payload. */
  body: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
