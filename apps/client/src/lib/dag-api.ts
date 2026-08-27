/**
 * Plain fetch helpers for the DAG workflow engine
 * (`/api/dag*` + `/api/projects/:projectId/dag*`). Kept out of the generated
 * api-client-react package (orval-generated, must not be hand-edited).
 */

export type {
  DagRunStatus,
  DagNodeStatus,
  DagNodeState,
  DagRunState,
  DagNodeDelta,
  DagRunDelta,
} from "@workspace/shared-types";

import type { DagRunState } from "@workspace/shared-types";
import { apiJson } from "@/lib/api-fetch";

function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiJson<T>(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

export function fetchDagState(projectId: string): Promise<DagRunState> {
  return request<DagRunState>(`/api/projects/${projectId}/dag/state`);
}

/** Product start path — cancels prior runs and resets artifacts via startProject. */
export function startDagProject(projectId: string): Promise<DagRunState> {
  return request<DagRunState>(`/api/projects/${projectId}/dag/start`, {
    method: "POST",
  });
}

export function pauseDagProject(projectId: string): Promise<DagRunState> {
  return request<DagRunState>(`/api/projects/${projectId}/dag/pause`, { method: "POST" });
}

export function resumeDagProject(projectId: string): Promise<DagRunState> {
  return request<DagRunState>(`/api/projects/${projectId}/dag/resume`, { method: "POST" });
}

export function approveDagNode(runId: string, nodeKey: string): Promise<DagRunState> {
  return request<DagRunState>(`/api/dag/runs/${runId}/nodes/${nodeKey}/approve`, { method: "POST" });
}

export const getDagStateQueryKey = (projectId: string) => ["projects", projectId, "dag", "state"] as const;
