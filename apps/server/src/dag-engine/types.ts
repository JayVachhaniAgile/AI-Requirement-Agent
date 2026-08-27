/**
 * DAG workflow engine — core TypeScript interfaces.
 * Wire statuses / API DTOs live in `@workspace/shared-types`.
 */

export type {
  DagNodeStatus,
  DagRunStatus,
  DagNodeState,
  DagRunState,
  DagNodeDelta,
  DagRunDelta,
} from '@workspace/shared-types';

/** Node definition inside a DAG. */
export interface DagNodeDef {
  /** Unique key within the DAG (matches agent keys where applicable). */
  key: string;
  /** Human-readable label. */
  label?: string;
  /** Underlying agent/executor key (defaults to node key). */
  agentKey?: string;
  /** Optional nodes may be skipped (or auto-skipped when deps fail). */
  optional?: boolean;
  /** Checkpoint node: pauses the run waiting for human approval. */
  checkpoint?: boolean;
  /** Max attempts after the first failure (default 2). */
  retries?: number;
  /** Optional per-node timeout in ms. */
  timeoutMs?: number;
}

/** Directed edge: `from` must complete before `to` starts. */
export interface DagEdgeDef {
  from: string;
  to: string;
}

/** Declarative DAG definition. */
export interface WorkflowDagDefinition {
  key: string;
  name: string;
  description?: string;
  nodes: DagNodeDef[];
  edges: DagEdgeDef[];
}

/** Metadata for one node inside a generated execution plan. */
export interface NodeMeta {
  key: string;
  label: string;
  agentKey: string;
  optional: boolean;
  checkpoint: boolean;
  retries: number;
  timeoutMs?: number;
  /** Node keys that must complete before this one. */
  dependsOn: string[];
}

/** Execution plan: nodes grouped into parallel-executable levels. */
export interface ExecutionPlan {
  definitionKey: string;
  /** levels[0] runs first; nodes within a level run in parallel. */
  layers: string[][];
  nodeMeta: Record<string, NodeMeta>;
}

/** Context passed to a node executor. */
export interface NodeExecutionContext {
  runId: string;
  projectId: string;
  definitionKey: string;
  nodeKey: string;
  attempt: number;
  /** Outputs of completed dependency nodes (keyed by node key). */
  deps: Record<string, unknown>;
  signal?: AbortSignal;
}

/** Result returned by a node executor. */
export interface NodeExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  /**
   * When true with success, pause the run for human approval even if the
   * node is not declared `checkpoint: true` in the DAG definition
   * (e.g. gap-analysis awaiting proposal review).
   */
  pauseForApproval?: boolean;
}

/** Executor signature: one function per node key. */
export type NodeExecutor = (
  ctx: NodeExecutionContext,
) => Promise<NodeExecutionResult>;
