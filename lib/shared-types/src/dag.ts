/** Shared DAG wire statuses / DTOs (API + socket payloads). */

export type DagNodeStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "WAITING_APPROVAL"
  | "BLOCKED";

export type DagRunStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface DagNodeState {
  id: string;
  nodeKey: string;
  status: DagNodeStatus;
  dependsOn: string[];
  required: boolean;
  checkpoint: boolean;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  output: unknown;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DagRunState {
  run: {
    id: string;
    projectId: string;
    definitionKey: string;
    status: DagRunStatus;
    currentLevel: number;
    currentNodeKey: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  nodes: DagNodeState[];
}

export interface DagNodeDelta {
  projectId: string;
  runId: string;
  nodeKey: string;
  status: DagNodeStatus;
  retryCount: number;
  error: string | null;
}

export interface DagRunDelta {
  projectId: string;
  runId: string;
  status: DagRunStatus;
  currentLevel: number;
  currentNodeKey: string | null;
}
