/**
 * Orchestration Engine 2.0 types (Phase 7).
 *
 * Dynamic, dependency-aware orchestration over Skills / Artifacts /
 * Dependencies / Context / Quality Gates. The legacy DAG engine is NOT
 * replaced — this engine plans and executes the new skill layer.
 */

export type OrchestrationState =
  | 'PLANNED'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'      // human checkpoint / dependency wait
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'      // dependency failed or paused workflow
  | 'CANCELLED'
  | 'RETRYING';

export type ApprovalType = 'REVIEW' | 'APPROVAL' | 'DECISION';

/** Conditional execution rules (evaluated at plan time against project state). */
export type ConditionRule =
  | { type: 'always' }
  | { type: 'skip-if-no-signal'; signal: string }
  | { type: 'reuse-if-artifact-exists'; artifactType: string; validStatuses?: string[] }
  | { type: 'skip-if-artifact-missing'; artifactType: string };

export interface OrchestrationNodeSpec {
  /** Node id (skill key). */
  id: string;
  skillKey: string;
  /** Node ids that must complete first. */
  dependsOn: string[];
  /** 0-based topological level. */
  level: number;
  /** When false, a failure does not block the rest of the workflow. */
  required: boolean;
  /** Human approval gate AFTER this node completes. */
  checkpoint?: boolean;
  approvalType?: ApprovalType;
  condition: ConditionRule;
  /** Quality gate keys to run after the skill. */
  qualityGates: string[];
  /** Artifact types this node produces. */
  producedArtifacts: string[];
  /** Artifact types this node consumes. */
  requiredArtifacts: string[];
  /** When true, the executor reuses an existing valid artifact instead of running. */
  reuse: boolean;
  /** Per-node retry cap (defaults to executor maxRetries). */
  maxRetries?: number;
}

export interface OrchestrationPlan {
  projectId: string;
  requestedOutcome: string;
  /** Node specs by id. */
  nodes: Record<string, OrchestrationNodeSpec>;
  /** Level -> node ids (parallel execution order). */
  levels: string[][];
  /** Optional human checkpoints: node id -> approval type. */
  checkpoints: Record<string, ApprovalType>;
  /** Nodes skipped at plan time (conditional rules / reuse). */
  skipped: string[];
  /** Plan version (bump on replan). */
  version: number;
  createdAt: string;
}

export interface PlanProjectState {
  /** Artifact types currently present in the project (valid). */
  artifactTypesPresent: string[];
  /** Signal flags for conditional rules (e.g. databaseChange). */
  signals: Record<string, boolean>;
  /** When set, the plan only covers this artifact's impact closure. */
  onlyAffectedBy?: string;
  /** Impact closure artifact ids (from ImpactAnalysisService). */
  affectedArtifactTypes?: string[];
}

export interface OrchestrationRequest {
  projectId: string;
  requestedOutcome: string;
  /** Artifact types that must exist after the run (default: skill-produced set). */
  targetArtifactTypes?: string[];
  /** Current project artifact types (default: empty). */
  artifactTypesPresent?: string[];
  /** Signal flags (default: {}). */
  signals?: Record<string, boolean>;
  /** Human checkpoints: { afterSkill, type }. */
  humanCheckpoints?: Array<{ afterSkill: string; type: ApprovalType }>;
  /** Max retries per skill node (default 2). */
  maxRetries?: number;
  /** Only run the impact closure of this artifact (incremental). */
  onlyAffectedBy?: string;
}

export interface NodeRunResult {
  nodeId: string;
  status: 'COMPLETED' | 'FAILED';
  error?: string;
  output?: Record<string, unknown>;
  /** When true, the node reused an existing artifact (no LLM call). */
  reused?: boolean;
}

export interface ExecutorOptions {
  /** Concurrency cap per level (default 4). */
  concurrency?: number;
  /** Retry base delay in ms (default 1000). */
  retryBaseDelayMs?: number;
  /** Max retries per node (default 2). */
  maxRetries?: number;
}

export interface CheckpointState {
  planId: string;
  nodeId: string;
  approvalType: ApprovalType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
}
