import type {
  AgentActivityEvent,
  KnowledgeCreatedEvent,
  ProjectDashboard,
} from "./dashboard-types";
import { apiFetch, apiJson } from "@/lib/api-fetch";

export type { ProjectDashboard, AgentActivityEvent, KnowledgeCreatedEvent };
export type { AgentActivityPhase, DashboardStep, DocumentStats } from "./dashboard-types";

export function fetchProjectDashboard(projectId: string): Promise<ProjectDashboard> {
  return apiJson<ProjectDashboard>(`/api/projects/${projectId}/dashboard`);
}

export function getProjectDashboardQueryKey(projectId: string) {
  return ["projects", projectId, "dashboard"] as const;
}

export async function recompileProjectDocument(projectId: string): Promise<void> {
  const response = await apiFetch(`/api/projects/${projectId}/recompile`, {
    method: "POST",
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (typeof body.message === "string") detail = body.message;
      else if (Array.isArray(body.message)) detail = body.message.join(", ");
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
}
