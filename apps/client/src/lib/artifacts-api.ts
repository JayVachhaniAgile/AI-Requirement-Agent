import { apiFetch, apiJson } from "@/lib/api-fetch";

export interface ArtifactSummary {
  id: string;
  projectId: string;
  projectName: string;
  documentType: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  /** Same document rendered as a clickable static website (concept preview). */
  websiteUrl: string;
}

export function fetchArtifacts(): Promise<ArtifactSummary[]> {
  return apiJson<ArtifactSummary[]>("/api/artifacts");
}

export function getArtifactsQueryKey() {
  return ["artifacts", "list"] as const;
}

/** Open the standalone HTML artifact in a new browser tab. */
export function openArtifact(artifact: ArtifactSummary): void {
  window.open(artifact.htmlUrl, "_blank", "noopener,noreferrer");
}

/** Open the artifact as a clickable static website (concept preview). */
export function openArtifactWebsite(artifact: ArtifactSummary): void {
  window.open(artifact.websiteUrl, "_blank", "noopener,noreferrer");
}

/**
 * Generate the build-prompt artifact for a project (creates it if missing,
 * or updates it in place). Works for projects that completed before the
 * artifact feature existed.
 */
export async function generateArtifact(projectId: string): Promise<void> {
  const res = await apiFetch(`/api/artifacts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === "string") detail = body.message;
      else if (Array.isArray(body.message)) detail = body.message.join(", ");
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
}

/**
 * Trigger regeneration of a single artifact (rebuilds the build-prompt
 * document in place for its project, without re-running downstream stages).
 * Throws on HTTP failure with the server-provided error message when available.
 */
export async function regenerateArtifact(artifactId: string): Promise<void> {
  const res = await apiFetch(`/api/artifacts/${artifactId}/regenerate`, {
    method: "POST",
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === "string") detail = body.message;
      else if (Array.isArray(body.message)) detail = body.message.join(", ");
    } catch {
      // ignore — fall back to status code message
    }
    throw new Error(detail);
  }
}
