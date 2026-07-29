import type {
  AgentActivityEvent,
  KnowledgeCreatedEvent,
  ProjectDashboard,
} from "./dashboard-types";

export type { ProjectDashboard, AgentActivityEvent, KnowledgeCreatedEvent };
export type { AgentActivityPhase, DashboardStep, DocumentStats } from "./dashboard-types";

export async function fetchProjectDashboard(projectId: string): Promise<ProjectDashboard> {
  const response = await fetch(`/api/projects/${projectId}/dashboard`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load dashboard (HTTP ${response.status})`);
  }
  return response.json() as Promise<ProjectDashboard>;
}

export function getProjectDashboardQueryKey(projectId: string) {
  return ["projects", projectId, "dashboard"] as const;
}

export async function recompileProjectDocument(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/recompile`, {
    method: "POST",
    headers: { Accept: "application/json" },
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
